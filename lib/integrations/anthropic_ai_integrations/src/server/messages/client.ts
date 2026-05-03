export const ANTHROPIC_API_KEY =
  process.env.ANTHROPIC_API_KEY || process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
export const ANTHROPIC_BASE_URL =
  process.env.ANTHROPIC_BASE_URL ||
  process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL ||
  "https://api.anthropic.com";
export const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL || process.env.AI_INTEGRATIONS_ANTHROPIC_MODEL || "claude-sonnet-4-5";

export const hasAnthropicApiKey = Boolean(ANTHROPIC_API_KEY);

export interface AnthropicJsonMessageOptions {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
}

export interface AnthropicMessageResponse {
  content?: Array<
    | { type: "text"; text?: string }
    | { type: string; text?: string; [key: string]: unknown }
  >;
  [key: string]: unknown;
}

export function buildAnthropicJsonMessageRequest(opts: AnthropicJsonMessageOptions) {
  return {
    model: opts.model,
    max_tokens: opts.maxTokens,
    temperature: opts.temperature,
    system: appendJsonOnlyInstruction(opts.system),
    messages: [{ role: "user", content: opts.user }],
  };
}

export async function callAnthropicJson<T>(
  label: string,
  opts: AnthropicJsonMessageOptions,
  fallback: T,
  requestImpl: typeof fetch = fetch,
): Promise<T> {
  if (!hasAnthropicApiKey) {
    console.warn(`[anthropic:${label}] no API key — returning fallback`);
    return fallback;
  }

  const response = await requestImpl(`${ANTHROPIC_BASE_URL.replace(/\/+$/, "")}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": ANTHROPIC_API_KEY ?? "",
    },
    body: JSON.stringify(buildAnthropicJsonMessageRequest(opts)),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`[anthropic:${label}] ${response.status} ${response.statusText}: ${text.slice(0, 500)}`);
  }

  const payload = (await response.json()) as AnthropicMessageResponse;
  return parseAnthropicJsonMessage<T>(payload) ?? fallback;
}

export function parseAnthropicJsonMessage<T = unknown>(response: AnthropicMessageResponse): T | null {
  const text = (response.content ?? [])
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n")
    .trim();
  if (!text) return null;
  return recoverJson<T>(text);
}

function appendJsonOnlyInstruction(system: string): string {
  const trimmed = system.trim();
  const instruction = "Respond with valid JSON only; do not include markdown fences.";
  if (!trimmed) return instruction;
  if (trimmed.includes(instruction)) return trimmed;
  return `${trimmed} ${instruction}`;
}

function recoverJson<T>(raw: string): T | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const objectStart = cleaned.indexOf("{");
    const objectEnd = cleaned.lastIndexOf("}");
    if (objectStart !== -1 && objectEnd > objectStart) {
      try {
        return JSON.parse(cleaned.slice(objectStart, objectEnd + 1)) as T;
      } catch {
        // fall through
      }
    }

    const arrayStart = cleaned.indexOf("[");
    const arrayEnd = cleaned.lastIndexOf("]");
    if (arrayStart !== -1 && arrayEnd > arrayStart) {
      try {
        return JSON.parse(cleaned.slice(arrayStart, arrayEnd + 1)) as T;
      } catch {
        // fall through
      }
    }
  }

  return null;
}
