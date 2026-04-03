import type { ChatMessageRequest, ChatMessageResponse } from "./generated/api.schemas";
import { ApiError, resolveApiUrl } from "./custom-fetch";
import { getOrCreateDemoSessionId } from "./session";

export function getPropertyChatPath(slug: string): string {
  return `/api/properties/${slug}/chat`;
}

function parseSseBlock(block: string): { event: string; data: string } {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith(":")) continue;
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  return { event, data: dataLines.join("\n") };
}

function normalizeSseBuffer(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function extractCompleteSseBlocks(buf: string): { blocks: string[]; rest: string } {
  const blocks: string[] = [];
  let b = normalizeSseBuffer(buf);
  for (;;) {
    const sep = b.indexOf("\n\n");
    if (sep === -1) return { blocks, rest: b };
    const block = b.slice(0, sep);
    b = b.slice(sep + 2);
    if (block.trim()) blocks.push(block);
  }
}

async function* readSseEvents(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (value) {
      buffer = normalizeSseBuffer(buffer + decoder.decode(value, { stream: !done }));
    }
    const extracted = extractCompleteSseBlocks(buffer);
    for (const block of extracted.blocks) {
      yield parseSseBlock(block);
    }
    buffer = extracted.rest;

    if (done) {
      buffer = normalizeSseBuffer(buffer + decoder.decode());
      const tail = extractCompleteSseBlocks(buffer);
      for (const block of tail.blocks) {
        yield parseSseBlock(block);
      }
      if (tail.rest.trim()) {
        yield parseSseBlock(tail.rest.trim());
      }
      break;
    }
  }
}

async function readErrorPayload(response: Response): Promise<unknown> {
  const raw = await response.text();
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

let loggedMissingInternalKey = false;

function buildChatHeaders(): Headers {
  const headers = new Headers({
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  });
  headers.set("x-session-id", getOrCreateDemoSessionId());
  const internalKey =
    typeof import.meta !== "undefined" && import.meta.env?.VITE_INTERNAL_API_KEY
      ? String(import.meta.env.VITE_INTERNAL_API_KEY).trim()
      : "";
  if (internalKey) {
    headers.set("x-api-key", internalKey);
  } else if (!loggedMissingInternalKey) {
    console.error("Missing VITE_INTERNAL_API_KEY");
    loggedMissingInternalKey = true;
  }
  return headers;
}

/**
 * POST /api/properties/:slug/chat — consumes Server-Sent Events (delta + done).
 */
export async function sendPropertyChatSse(
  slug: string,
  chatMessageRequest: ChatMessageRequest,
  onDelta: (text: string) => void,
  init?: RequestInit,
): Promise<ChatMessageResponse> {
  const path = getPropertyChatPath(slug);
  const url = resolveApiUrl(path);
  const headers = buildChatHeaders();
  if (init?.headers) {
    new Headers(init.headers).forEach((v, k) => headers.set(k, v));
  }

  const response = await fetch(url, {
    ...init,
    method: "POST",
    headers,
    body: JSON.stringify(chatMessageRequest),
  });

  const requestInfo = { method: "POST", url };

  if (!response.ok) {
    const errorData = await readErrorPayload(response);
    throw new ApiError(response, errorData, requestInfo);
  }

  const media =
    response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "";

  /** Older API builds returned JSON 200 — still drive UI with one onDelta + full payload. */
  if (media.includes("application/json")) {
    const data = (await response.json()) as ChatMessageResponse;
    if (typeof data?.reply === "string" && data.reply.length > 0) {
      onDelta(data.reply);
    }
    return data;
  }

  if (!media.includes("text/event-stream")) {
    throw new ApiError(
      response,
      { error: `Expected text/event-stream, got: ${media || "(no content-type)"}` },
      requestInfo,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new ApiError(response, { error: "Empty response body" }, requestInfo);
  }

  let donePayload: ChatMessageResponse | null = null;

  for await (const evt of readSseEvents(reader)) {
    if (evt.event === "delta") {
      try {
        const parsed = JSON.parse(evt.data) as { text?: string };
        if (typeof parsed.text === "string" && parsed.text.length > 0) {
          onDelta(parsed.text);
        }
      } catch {
        /* ignore malformed chunk */
      }
    } else if (evt.event === "done") {
      try {
        donePayload = JSON.parse(evt.data) as ChatMessageResponse;
      } catch {
        throw new Error("Invalid done payload from chat stream");
      }
    } else if (evt.event === "error") {
      let message = "Stream error";
      try {
        const parsed = JSON.parse(evt.data) as { message?: string };
        if (typeof parsed.message === "string") message = parsed.message;
      } catch {
        /* use default */
      }
      throw new Error(message);
    }
  }

  if (!donePayload || typeof donePayload.reply !== "string") {
    throw new Error("Chat stream ended without a valid done event");
  }

  return donePayload;
}
