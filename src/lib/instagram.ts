// Instagram API with Instagram Login (graph.instagram.com) — not the older
// Facebook-Login-based Instagram Graph API (graph.facebook.com). Token
// exchange/refresh here only ever needs the Instagram app secret + the
// current token itself, never a Facebook App ID/Secret pair.
const GRAPH_API = "https://graph.instagram.com/v21.0";

function getInstagramConfig() {
  const igUserId = process.env.IG_USER_ID;
  if (!igUserId) throw new Error("IG_USER_ID is not set");
  return { igUserId };
}

function getInstagramAppSecret(): string {
  const secret = process.env.IG_APP_SECRET;
  if (!secret) throw new Error("IG_APP_SECRET is not set");
  return secret;
}

async function graphFetch<T>(path: string, accessToken: string, init: RequestInit = {}): Promise<T> {
  const url = new URL(`${GRAPH_API}${path}`);
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url, init);
  const data = (await response.json()) as { error?: { message?: string } };
  if (!response.ok) {
    const message = data.error?.message ?? `status ${response.status}`;
    throw new Error(`Instagram Graph API request to ${path} failed: ${message}`);
  }
  return data as T;
}

/** Creates a single-image container for use as a carousel child. Returns its creation ID. */
export async function createChildContainer(imageUrl: string, accessToken: string): Promise<string> {
  const { igUserId } = getInstagramConfig();
  const data = await graphFetch<{ id: string }>(`/${igUserId}/media`, accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: imageUrl, is_carousel_item: true }),
  });
  return data.id;
}

/** Creates the parent carousel container from child creation IDs. Returns its creation ID. */
export async function createCarouselContainer(
  childIds: string[],
  caption: string,
  accessToken: string
): Promise<string> {
  const { igUserId } = getInstagramConfig();
  const data = await graphFetch<{ id: string }>(`/${igUserId}/media`, accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ media_type: "CAROUSEL", children: childIds, caption }),
  });
  return data.id;
}

/** Polls a container until Graph API finishes processing it, or throws on error/timeout. */
export async function pollContainerStatus(creationId: string, accessToken: string): Promise<void> {
  const maxAttempts = 20;
  const delayMs = 3000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const data = await graphFetch<{ status_code: string }>(`/${creationId}?fields=status_code`, accessToken);
    if (data.status_code === "FINISHED") return;
    if (data.status_code === "ERROR") {
      throw new Error(`Instagram container ${creationId} failed processing`);
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error(`Instagram container ${creationId} did not finish processing in time`);
}

/** Publishes a finished container. Returns the published media ID. */
export async function publishContainer(creationId: string, accessToken: string): Promise<string> {
  const { igUserId } = getInstagramConfig();
  const data = await graphFetch<{ id: string }>(`/${igUserId}/media_publish`, accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: creationId }),
  });
  return data.id;
}

export async function getPermalink(mediaId: string, accessToken: string): Promise<string> {
  const data = await graphFetch<{ permalink: string }>(`/${mediaId}?fields=permalink`, accessToken);
  return data.permalink;
}

/**
 * Refreshes a long-lived token for a fresh ~60-day one. The token must
 * already be at least 24h old and not yet expired. No app secret needed —
 * only the current token itself.
 */
export async function refreshLongLivedToken(currentToken: string): Promise<string> {
  const url = new URL(`https://graph.instagram.com/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", currentToken);

  const response = await fetch(url);
  const data = (await response.json()) as { error?: { message?: string }; access_token?: string };
  if (!response.ok) {
    const message = data.error?.message ?? `status ${response.status}`;
    throw new Error(`Token refresh failed: ${message}`);
  }

  const newToken = data.access_token;
  if (!newToken) throw new Error("Token refresh response had no access_token");
  return newToken;
}

/**
 * One-time exchange of a short-lived token (e.g. straight from the "Generate
 * access tokens" button in the Meta app dashboard) for a long-lived ~60-day
 * one. Needs the Instagram app secret.
 */
export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<string> {
  const appSecret = getInstagramAppSecret();
  const url = new URL(`https://graph.instagram.com/access_token`);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("access_token", shortLivedToken);

  const response = await fetch(url);
  const data = (await response.json()) as { error?: { message?: string }; access_token?: string };
  if (!response.ok) {
    const message = data.error?.message ?? `status ${response.status}`;
    throw new Error(`Token exchange failed: ${message}`);
  }

  const newToken = data.access_token;
  if (!newToken) throw new Error("Token exchange response had no access_token");
  return newToken;
}

/** Resolves the Instagram professional account ID (ig-user-id) for a token. */
export async function getIgUserId(accessToken: string): Promise<{ userId: string; username: string }> {
  const data = await graphFetch<{ user_id: string; username: string }>(
    "/me?fields=user_id,username",
    accessToken
  );
  return { userId: data.user_id, username: data.username };
}
