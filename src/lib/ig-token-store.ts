import { notionFetch } from "./notion.js";

function getTokenStoreDatabaseId(): string {
  const id = process.env.NOTION_IG_TOKEN_DB_ID;
  if (!id) throw new Error("NOTION_IG_TOKEN_DB_ID is not set");
  return id;
}

let cachedDataSourceId: string | null = null;

async function resolveTokenStoreDataSourceId(): Promise<string> {
  if (cachedDataSourceId) return cachedDataSourceId;
  const data = await notionFetch<{ data_sources: { id: string }[] }>(
    `/databases/${getTokenStoreDatabaseId()}`
  );
  const id = data.data_sources[0]?.id;
  if (!id) throw new Error("IG Token Store database has no data sources");
  cachedDataSourceId = id;
  return id;
}

function plainText(richText: { plain_text: string }[] | undefined): string {
  return (richText ?? []).map((t) => t.plain_text).join("");
}

interface TokenRow {
  pageId: string;
  accessToken: string;
  issuedAt: string | null;
}

async function getTokenRow(): Promise<TokenRow> {
  const dataSourceId = await resolveTokenStoreDataSourceId();
  const page = await notionFetch<{ results: { id: string; properties: Record<string, any> }[] }>(
    `/data_sources/${dataSourceId}/query`,
    { method: "POST", body: JSON.stringify({ page_size: 1 }) }
  );
  const row = page.results[0];
  if (!row) {
    throw new Error("IG Token Store has no rows — create one row in the database first");
  }
  return {
    pageId: row.id,
    accessToken: plainText(row.properties["Access Token"]?.rich_text),
    issuedAt: row.properties["Issued At"]?.date?.start ?? null,
  };
}

async function updateTokenRow(pageId: string, properties: Record<string, any>): Promise<void> {
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  });
}

/** Returns the current live token, bootstrapping the store from IG_ACCESS_TOKEN on first use. */
export async function getCurrentToken(): Promise<string> {
  const row = await getTokenRow();
  if (row.accessToken) return row.accessToken;

  const seed = process.env.IG_ACCESS_TOKEN;
  if (!seed) {
    throw new Error("IG Token Store is empty and IG_ACCESS_TOKEN is not set to seed it");
  }

  await updateTokenRow(row.pageId, {
    "Access Token": { rich_text: [{ type: "text", text: { content: seed } }] },
    "Issued At": { date: { start: new Date().toISOString() } },
    Status: { select: { name: "OK" } },
    "Last Checked": { date: { start: new Date().toISOString() } },
  });
  return seed;
}

/** Days since the current token was issued/last refreshed. Infinity if never set, forcing a bootstrap. */
export async function getTokenAgeDays(): Promise<number> {
  const row = await getTokenRow();
  if (!row.issuedAt) return Infinity;
  const issued = new Date(row.issuedAt).getTime();
  return (Date.now() - issued) / (1000 * 60 * 60 * 24);
}

export async function saveRefreshedToken(newToken: string): Promise<void> {
  const row = await getTokenRow();
  await updateTokenRow(row.pageId, {
    "Access Token": { rich_text: [{ type: "text", text: { content: newToken } }] },
    "Issued At": { date: { start: new Date().toISOString() } },
    Status: { select: { name: "OK" } },
    "Last Checked": { date: { start: new Date().toISOString() } },
    "Last Error": { rich_text: [] },
  });
}

export async function markTokenRefreshFailed(message: string): Promise<void> {
  const row = await getTokenRow();
  await updateTokenRow(row.pageId, {
    Status: { select: { name: "Needs Attention" } },
    "Last Checked": { date: { start: new Date().toISOString() } },
    "Last Error": { rich_text: [{ type: "text", text: { content: message.slice(0, 1990) } }] },
  });
}
