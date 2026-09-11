function getGatewayConfig() {
  const apiKey = process.env.GATEWAY_API_KEY;
  const baseUrl = process.env.GATEWAY_BASE_URL;
  const model = process.env.GATEWAY_MODEL;
  if (!apiKey) throw new Error("GATEWAY_API_KEY is not set");
  if (!baseUrl) throw new Error("GATEWAY_BASE_URL is not set");
  if (!model) throw new Error("GATEWAY_MODEL is not set");
  return { apiKey, baseUrl, model };
}

/**
 * Calls the OpenAI-compatible gateway and returns the raw assistant message content.
 * Callers are responsible for stripping markdown fences and parsing/validating JSON.
 */
export async function callGateway(messages: { role: "system" | "user"; content: string }[]): Promise<string> {
  const { apiKey, baseUrl, model } = getGatewayConfig();

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
    }),
  });

  if (!response.ok) {
    const status = response.status;
    throw new Error(`Gateway request failed with status ${status}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Gateway response had no message content");
  return content;
}

/** Strips ```json ... ``` / ``` ... ``` fences before JSON.parse. */
export function parseJsonFromModel<T>(raw: string): T {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  return JSON.parse(stripped) as T;
}
