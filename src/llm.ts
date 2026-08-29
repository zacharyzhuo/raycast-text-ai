import { getPreferenceValues } from "@raycast/api";

/** Preferences is ambient, generated from package.json into raycast-env.d.ts. */
type Provider = Preferences["provider"];

export interface Message {
  role: "user" | "assistant";
  content: string;
}

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_TOKENS = 4096;
const DEFAULT_MODEL: Record<Provider, string> = {
  anthropic: "claude-haiku-4-5-20251001",
  gemini: "gemini-2.5-flash",
};

/** Thrown for anything the user can act on: bad key, wrong model name, network down. */
export class LLMError extends Error {}

export async function complete(systemPrompt: string, messages: Message[]): Promise<string> {
  const { provider, apiKey, workspaceId, model } = getPreferenceValues<Preferences>();

  if (!apiKey) {
    throw new LLMError("API key is not set. Open the extension preferences and add one.");
  }
  if (messages.length === 0) {
    throw new LLMError("Nothing to send.");
  }

  const resolvedModel = (model ?? "").trim() || DEFAULT_MODEL[provider];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return provider === "gemini"
      ? await callGemini(apiKey, resolvedModel, systemPrompt, messages, controller.signal)
      : await callAnthropic(apiKey, resolvedModel, workspaceId, systemPrompt, messages, controller.signal);
  } catch (error) {
    if (error instanceof LLMError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new LLMError(`No response within ${REQUEST_TIMEOUT_MS / 1000}s.`);
    }
    throw new LLMError(error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
  }
}

async function callAnthropic(
  apiKey: string,
  model: string,
  workspaceId: string | undefined,
  systemPrompt: string,
  messages: Message[],
  signal: AbortSignal,
): Promise<string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };

  // A multi-workspace personal or service account key is not bound to one workspace,
  // so every request has to name the workspace it acts in. Single-workspace and legacy
  // workspace keys resolve on their own, so the header stays off unless it is configured.
  const workspace = (workspaceId ?? "").trim();
  if (workspace) {
    headers["anthropic-workspace-id"] = workspace;
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers,
    body: JSON.stringify({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0,
      system: systemPrompt,
      // Anthropic uses the same "user"/"assistant" role names this module does.
      messages,
    }),
  });

  const payload = await readJson(response, "Anthropic");
  const text = (payload.content as { type: string; text?: string }[] | undefined)
    ?.filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("")
    .trim();

  if (!text) throw new LLMError("Anthropic returned an empty response.");
  return text;
}

async function callGemini(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: Message[],
  signal: AbortSignal,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: messages.map((message) => ({
        // Gemini names the assistant role "model". Sending "assistant" is rejected with
        // a 400, so the mapping has to happen here rather than at the call site.
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      })),
      generationConfig: { temperature: 0, maxOutputTokens: MAX_OUTPUT_TOKENS },
    }),
  });

  const payload = await readJson(response, "Gemini");
  const candidate = (payload.candidates as { content?: { parts?: { text?: string }[] } }[] | undefined)?.[0];
  const text = candidate?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) throw new LLMError("Gemini returned an empty response.");
  return text;
}

/** Surfaces the provider's own error message instead of a bare status code. */
async function readJson(response: Response, providerLabel: string): Promise<Record<string, unknown>> {
  const raw = await response.text();
  let payload: Record<string, unknown>;

  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new LLMError(`${providerLabel} returned HTTP ${response.status}: ${raw.slice(0, 200)}`);
  }

  if (!response.ok) {
    const detail = (payload.error as { message?: string } | undefined)?.message ?? raw.slice(0, 200);
    throw new LLMError(`${providerLabel} HTTP ${response.status}: ${detail}`);
  }

  return payload;
}
