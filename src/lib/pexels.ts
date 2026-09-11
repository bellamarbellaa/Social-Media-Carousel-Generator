import { callGateway, parseJsonFromModel } from "./gateway.js";

export interface Backdrop {
  dataUri: string;
  photographer: string;
  photographerUrl: string;
  pexelsUrl: string;
}

interface SlideContext {
  headline: string;
  body?: string;
}

interface PexelsPhoto {
  id: number;
  alt: string;
  avg_color: string;
  url: string;
  photographer: string;
  photographer_url: string;
  src: { original: string };
}

function getPexelsKey(): string {
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new Error("PEXELS_API_KEY is not set");
  return key;
}

async function searchPexels(query: string, opts: { withSizeFilter: boolean }): Promise<PexelsPhoto[]> {
  const params = new URLSearchParams({
    query,
    orientation: "portrait",
    locale: "en-US",
    per_page: "15",
  });
  if (opts.withSizeFilter) params.set("size", "medium");

  const response = await fetch(`https://api.pexels.com/v1/search?${params.toString()}`, {
    headers: { Authorization: getPexelsKey() }, // raw key, no "Bearer" prefix
  });
  if (!response.ok) throw new Error(`Pexels search failed with status ${response.status}`);

  const data = (await response.json()) as { photos: PexelsPhoto[] };
  return data.photos;
}

async function candidatesForQuery(query: string): Promise<PexelsPhoto[]> {
  let candidates = await searchPexels(query, { withSizeFilter: true });
  if (candidates.length < 5) {
    candidates = await searchPexels(query, { withSizeFilter: false });
  }
  return candidates;
}

interface GatewayChoice {
  slideIndex: number;
  photoId: number;
}

async function pickBestPhotoPerSlide(
  candidatesPerSlide: PexelsPhoto[][],
  context: SlideContext[]
): Promise<number[]> {
  const prompt = `You are choosing one background photo per Instagram carousel slide from
real, already-published stock photo candidates. For each slide, pick the candidate whose
"alt" description best matches the slide's headline/body mood and subject. Prefer photos
of concrete settings and objects over abstract or busy compositions — the text will be
laid on top, so a calmer photo with clear negative space is usually the better pick.

Avoid generic, neutral, catalog-looking stock photography — posed smiling-at-camera shots,
flat corporate-office scenes, or anything that reads as an obvious stock photo. Prefer candid,
editorial-feeling images: natural light, real texture, a genuine moment or specific detail
rather than a generic illustration of the concept. When two candidates are a similar semantic
match, pick the one with more visual specificity and mood over the more literal/generic one.

Slides and their candidates:
${context
  .map(
    (slide, i) => `
Slide ${i}: "${slide.headline}"${slide.body ? ` — ${slide.body}` : ""}
Candidates: ${JSON.stringify(
      candidatesPerSlide[i]?.map((c) => ({ id: c.id, alt: c.alt, avg_color: c.avg_color })) ?? []
    )}`
  )
  .join("\n")}

Return ONLY JSON, no markdown fences, no commentary:
{"choices": [{"slideIndex": 0, "photoId": <id from that slide's candidates>}, ...]}
Every slideIndex from 0 to ${context.length - 1} must appear exactly once.`;

  const raw = await callGateway([{ role: "user", content: prompt }]);
  const parsed = parseJsonFromModel<{ choices: GatewayChoice[] }>(raw);

  if (!Array.isArray(parsed.choices) || parsed.choices.length !== context.length) {
    throw new Error("Gateway image selection returned the wrong number of choices");
  }

  const chosenIds: number[] = new Array(context.length).fill(-1);
  const usedIds = new Set<number>();

  for (const choice of parsed.choices) {
    const candidates = candidatesPerSlide[choice.slideIndex];
    if (!candidates) throw new Error(`Gateway chose an out-of-range slideIndex: ${choice.slideIndex}`);
    const validIds = new Set(candidates.map((c) => c.id));
    let photoId = choice.photoId;
    if (!validIds.has(photoId) || usedIds.has(photoId)) {
      const fallback = candidates.find((c) => !usedIds.has(c.id));
      if (!fallback) throw new Error(`No unused candidate left for slide ${choice.slideIndex}`);
      photoId = fallback.id;
    }
    chosenIds[choice.slideIndex] = photoId;
    usedIds.add(photoId);
  }

  if (chosenIds.some((id) => id === -1)) {
    throw new Error("Gateway image selection left a slide without a chosen photo");
  }
  return chosenIds;
}

async function toDataUri(photo: PexelsPhoto): Promise<string> {
  const cropUrl = `${photo.src.original}?auto=compress&cs=tinysrgb&fit=crop&w=1080&h=1350`;
  const response = await fetch(cropUrl);
  if (!response.ok) throw new Error(`Failed to download Pexels photo ${photo.id}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

/**
 * Fetches one backdrop photo per query, with the gateway model choosing the best-matching
 * candidate per slide from real Pexels search results (never AI-generated).
 * Isolated behind this function so the source can be swapped later without touching task logic.
 */
export async function getBackdrops(queries: string[], context: SlideContext[]): Promise<Backdrop[]> {
  const candidatesPerSlide = await Promise.all(queries.map((q) => candidatesForQuery(q)));

  const emptyIndex = candidatesPerSlide.findIndex((c) => c.length === 0);
  if (emptyIndex !== -1) {
    throw new Error(`Pexels returned no candidates for query: "${queries[emptyIndex]}"`);
  }

  const chosenIds = await pickBestPhotoPerSlide(candidatesPerSlide, context);

  const chosenPhotos = chosenIds.map((id, i) => {
    const photo = candidatesPerSlide[i]?.find((c) => c.id === id);
    if (!photo) throw new Error(`Chosen photo id ${id} not found among slide ${i}'s candidates`);
    return photo;
  });

  return Promise.all(
    chosenPhotos.map(async (photo) => ({
      dataUri: await toDataUri(photo),
      photographer: photo.photographer,
      photographerUrl: photo.photographer_url,
      pexelsUrl: photo.url,
    }))
  );
}
