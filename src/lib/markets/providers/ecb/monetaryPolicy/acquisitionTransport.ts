import "server-only";

import { ECB_GOVERNING_COUNCIL_CALENDAR_URL } from "../../../events/ecbMonetaryPolicy";
import { validateKnownEcbDecisionReferenceV1 } from "./parser";

/** Same bounded-stream pattern as the Eurostat provider, sized for ECB HTML. */
export const ECB_EVENT_MAX_RESPONSE_BYTES_V1 = 2 * 1024 * 1024;

export class EcbEventTransportError extends Error {
  constructor(readonly code:
    | "invalid-url" | "http" | "redirect" | "content-type" | "content-length"
    | "missing-body" | "response-too-large" | "invalid-encoding" | "network" | "aborted",
  ) {
    super(`ECB event transport failed: ${code}.`);
    this.name = "EcbEventTransportError";
  }
}

export interface EcbEventHtmlTransportDependenciesV1 {
  readonly fetchImpl?: typeof fetch;
  readonly signal: AbortSignal;
}

/** One explicit request, no cache/retry/registration. Caller owns cancellation/deadline. */
export async function loadEcbEventHtmlV1(
  sourceUrl: string,
  dependencies: EcbEventHtmlTransportDependenciesV1,
): Promise<string> {
  if (typeof window !== "undefined") throw new Error("ECB event acquisition is server-only.");
  assertOfficialSource(sourceUrl);
  const { signal } = dependencies;
  if (signal.aborted) throw new EcbEventTransportError("aborted");
  const usesDefaultFetch = dependencies.fetchImpl === undefined;
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  let response: Response | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let consumed = false;
  try {
    response = await cancellable(() => fetchImpl(sourceUrl, {
      method: "GET", headers: { Accept: "text/html" }, redirect: "error", signal,
      cache: "no-store",
    }), signal);
    if (!response.ok) throw new EcbEventTransportError("http");
    if (response.redirected || (response.url !== "" && response.url !== sourceUrl)) {
      throw new EcbEventTransportError("redirect");
    }
    const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (mediaType !== "text/html") throw new EcbEventTransportError("content-type");
    const length = response.headers.get("content-length");
    if (length !== null) {
      if (!/^(?:0|[1-9]\d*)$/.test(length)) throw new EcbEventTransportError("content-length");
      if (Number(length) > ECB_EVENT_MAX_RESPONSE_BYTES_V1) {
        throw new EcbEventTransportError("response-too-large");
      }
    }
    if (response.body === null) throw new EcbEventTransportError("missing-body");
    reader = response.body.getReader();
    const bytes = new Uint8Array(ECB_EVENT_MAX_RESPONSE_BYTES_V1);
    let total = 0;
    while (true) {
      const activeReader = reader;
      const cell = await cancellable(() => activeReader.read(), signal);
      if (cell.done) break;
      if (cell.value.byteLength > bytes.length - total) {
        throw new EcbEventTransportError("response-too-large");
      }
      bytes.set(cell.value, total);
      total += cell.value.byteLength;
    }
    consumed = true;
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, total));
    } catch (error) {
      if (error instanceof TypeError && "code" in error && error.code === "ERR_ENCODING_INVALID_ENCODED_DATA") {
        throw new EcbEventTransportError("invalid-encoding");
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError")) {
      throw new EcbEventTransportError("aborted");
    }
    // Injected transports must throw this typed error for expected network failures.
    // Only recognize the native fetch failure shape; arbitrary TypeError stays a defect.
    if (usesDefaultFetch && error instanceof TypeError && error.message === "fetch failed" &&
        "cause" in error && error.cause instanceof Error &&
        !(error.cause instanceof TypeError || error.cause instanceof ReferenceError)) {
      throw new EcbEventTransportError("network");
    }
    if (usesDefaultFetch && error instanceof TypeError && error.message === "terminated" &&
        "cause" in error && error.cause instanceof Error && "code" in error.cause &&
        ["UND_ERR_SOCKET", "UND_ERR_BODY_TIMEOUT", "ECONNRESET"].includes(String(error.cause.code))) {
      throw new EcbEventTransportError("network");
    }
    throw error;
  } finally {
    if (!consumed) {
      try {
        if (reader !== undefined) await reader.cancel();
        else await response?.body?.cancel();
      } catch { /* Cleanup must preserve the original failure. */ }
    }
    try { reader?.releaseLock(); }
    catch { /* Cleanup must preserve the original failure. */ }
  }
}

function assertOfficialSource(sourceUrl: string): void {
  if (sourceUrl === ECB_GOVERNING_COUNCIL_CALENDAR_URL) return;
  // Reuse the exact known-document URL/date/authority contract, never discover URLs.
  const match = /\/date\/(\d{4})\/html\/ecb\.mp\d{2}(\d{2})(\d{2})~/.exec(sourceUrl);
  const decisionDate = match === null ? "" : `${match[1]}-${match[2]}-${match[3]}`;
  if (validateKnownEcbDecisionReferenceV1({
    sourceInstitution: "ECB", decisionDate, documentUrl: sourceUrl,
  }).status !== "available") throw new EcbEventTransportError("invalid-url");
}

async function cancellable<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new EcbEventTransportError("aborted");
  let abort: () => void = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(new EcbEventTransportError("aborted"));
    signal.addEventListener("abort", abort, { once: true });
  });
  try { return await Promise.race([operation(), cancelled]); }
  finally { signal.removeEventListener("abort", abort); }
}
