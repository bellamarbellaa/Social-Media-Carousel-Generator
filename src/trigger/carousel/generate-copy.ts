import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { callGateway, parseJsonFromModel } from "../../lib/gateway.js";
import { BRAND_HANDLE, VOICE_PROMPT } from "../../lib/brand.config.js";
import { GeneratedCopySchema, type GeneratedCopy } from "./types.js";

const SYSTEM_PROMPT = `You write Instagram carousel copy for ${BRAND_HANDLE}.

${VOICE_PROMPT}

Slide rules (hard technical constraints, not style preferences):
- The "slides" array MUST contain EXACTLY 5 items. Not 4, not 6, not 7. Exactly 5:
  1 "cover", then 3 "body", then 1 "outro", in that order. Before you respond, count
  the items in your "slides" array and remove or merge any extra ones until there are
  exactly 5 — a response with any other count will be rejected and regenerated.
- searchQuery per slide: 2-4 words, concrete nouns and settings for a stock photo search.
  Never moods or abstractions. Good: "linen bedsheets morning light". Bad: "feeling of calm".

Caption: matches the voice above, ends naturally (photo credits are appended separately,
don't write your own credit line).

Return ONLY this JSON shape, no markdown fences, no commentary:
{
  "slides": [
    { "kind": "cover", "headline": "...", "searchQuery": "..." },
    { "kind": "body",  "headline": "...", "body": "...", "searchQuery": "..." },
    { "kind": "body",  "headline": "...", "body": "...", "searchQuery": "..." },
    { "kind": "body",  "headline": "...", "body": "...", "searchQuery": "..." },
    { "kind": "outro", "headline": "...", "body": "...", "searchQuery": "..." }
  ],
  "caption": "...",
  "hashtags": ["...", "..."]
}`;

export const generateCopy = schemaTask({
  id: "carousel-generate-copy",
  schema: z.object({
    topic: z.string(),
    pillar: z.string(),
    angle: z.string(),
  }),
  run: async (payload): Promise<GeneratedCopy> => {
    const userPrompt = `Pillar: ${payload.pillar}
Topic: ${payload.topic}
Angle: ${payload.angle || "(none given — use your judgment for this pillar)"}`;

    const raw = await callGateway([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ]);

    const parsedJson = parseJsonFromModel<unknown>(raw);
    // Throws on a malformed shape or slides.length !== 5, so Trigger.dev retries
    // instead of rendering a broken carousel.
    return GeneratedCopySchema.parse(parsedJson);
  },
});
