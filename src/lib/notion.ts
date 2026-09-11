const NOTION_VERSION = "2025-09-03";
const NOTION_API = "https://api.notion.com/v1";

export interface QueuedRow {
  pageId: string;
  topic: string;
  pillar: string;
  angle: string;
  priority: number;
}

function getNotionKey(): string {
  const key = process.env.NOTION_API_KEY;
  if (!key) throw new Error("NOTION_API_KEY is not set");
  return key;
}

function getDatabaseId(): string {
  const id = process.env.NOTION_DATABASE_ID;
  if (!id) throw new Error("NOTION_DATABASE_ID is not set");
  return id;
}

async function notionFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${NOTION_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getNotionKey()}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    // Never log the raw body here — it can echo back request context.
    throw new Error(`Notion API request to ${path} failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

let cachedDataSourceId: string | null = null;

/** Resolves the database's data source ID once per process (Notion's 2025-09-03 multi-source model). */
export async function resolveDataSourceId(): Promise<string> {
  if (cachedDataSourceId) return cachedDataSourceId;
  const data = await notionFetch<{ data_sources: { id: string }[] }>(`/databases/${getDatabaseId()}`);
  const id = data.data_sources[0]?.id;
  if (!id) throw new Error("Database has no data sources");
  cachedDataSourceId = id;
  return id;
}

interface DataSourceQueryResult {
  results: {
    id: string;
    properties: Record<string, any>;
  }[];
  has_more: boolean;
  next_cursor: string | null;
}

async function queryByStatus(status: string): Promise<DataSourceQueryResult["results"]> {
  const dataSourceId = await resolveDataSourceId();
  const results: DataSourceQueryResult["results"] = [];
  let cursor: string | undefined;

  do {
    const page = await notionFetch<DataSourceQueryResult>(`/data_sources/${dataSourceId}/query`, {
      method: "POST",
      body: JSON.stringify({
        filter: { property: "Status", status: { equals: status } },
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    });
    results.push(...page.results);
    cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return results;
}

function plainText(richText: { plain_text: string }[] | undefined): string {
  return (richText ?? []).map((t) => t.plain_text).join("");
}

export async function countReadyForReview(): Promise<number> {
  const rows = await queryByStatus("Ready For Review");
  return rows.length;
}

/** Highest-Priority "Queued" row, sorted client-side since Priority is now a plain number. */
export async function getTopQueuedRow(): Promise<QueuedRow | null> {
  const rows = await queryByStatus("Queued");
  if (rows.length === 0) return null;

  const parsed = rows.map((row) => ({
    pageId: row.id,
    topic: plainText(row.properties.Topic?.title),
    pillar: row.properties.Pillar?.select?.name ?? "",
    angle: plainText(row.properties.Angle?.rich_text),
    priority: row.properties.Priority?.number ?? 0,
  }));

  parsed.sort((a, b) => b.priority - a.priority);
  return parsed[0] ?? null;
}

async function updateProperties(pageId: string, properties: Record<string, any>): Promise<void> {
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  });
}

export async function claimRow(pageId: string, runId: string): Promise<void> {
  await updateProperties(pageId, {
    Status: { status: { name: "In progress" } },
    "Run ID": { rich_text: [{ type: "text", text: { content: runId } }] },
  });
}

export async function resetToQueued(pageId: string): Promise<void> {
  await updateProperties(pageId, {
    Status: { status: { name: "Queued" } },
    "Run ID": { rich_text: [] },
  });
}

export async function markReadyForReview(pageId: string): Promise<void> {
  await updateProperties(pageId, {
    Status: { status: { name: "Ready For Review" } },
    "Generated At": { date: { start: new Date().toISOString() } },
  });
}

interface UploadedFile {
  id: string;
}

async function uploadFile(filename: string, buffer: Buffer, contentType: string): Promise<UploadedFile> {
  const created = await notionFetch<{ id: string; upload_url: string }>(`/file_uploads`, {
    method: "POST",
    body: JSON.stringify({ filename, content_type: contentType }),
  });

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: contentType }), filename);

  const sendResponse = await fetch(created.upload_url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getNotionKey()}`,
      "Notion-Version": NOTION_VERSION,
    },
    body: form,
  });
  if (!sendResponse.ok) {
    throw new Error(`Notion file upload send failed with status ${sendResponse.status}`);
  }

  return { id: created.id };
}

export interface PhotoCredit {
  photographer: string;
  photographerUrl: string;
  pexelsUrl: string;
}

export async function appendCarouselContent(
  pageId: string,
  pngs: { buffer: Buffer; filename: string }[],
  caption: string,
  hashtags: string[],
  credits: PhotoCredit[]
): Promise<void> {
  const uploaded = await Promise.all(pngs.map((png) => uploadFile(png.filename, png.buffer, "image/png")));

  const imageBlocks = uploaded.map((file) => ({
    object: "block",
    type: "image",
    image: { type: "file_upload", file_upload: { id: file.id } },
  }));

  const textBlock = (content: string) => ({
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: [{ type: "text", text: { content } }] },
  });

  const creditLines = credits
    .map((c) => `Photo by ${c.photographer} on Pexels: ${c.pexelsUrl} (${c.photographerUrl})`)
    .join("\n");

  await notionFetch(`/blocks/${pageId}/children`, {
    method: "PATCH",
    body: JSON.stringify({
      children: [
        ...imageBlocks,
        textBlock(caption),
        textBlock(hashtags.join(" ")),
        textBlock(creditLines),
      ],
    }),
  });
}
