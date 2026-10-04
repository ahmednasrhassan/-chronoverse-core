export const BOJ_POLICY_MAX_RESPONSE_BYTES_V1 = 2 * 1024 * 1024;

export class BojPolicyTransportError extends Error {
  constructor(readonly code:
    | "invalid-request" | "http" | "redirect" | "content-type" | "content-length"
    | "missing-body" | "response-too-large" | "invalid-encoding" | "network" | "aborted") {
    super(`BoJ policy transport failed: ${code}.`);
    this.name = "BojPolicyTransportError";
  }
}

export interface BojPolicyTransportDependenciesV1 {
  readonly fetchImpl: typeof fetch;
  readonly signal: AbortSignal;
}

export interface BojPolicyDocumentV1 {
  readonly url: string;
  readonly html: string;
}

export type BojPolicyDocumentLoaderV1 = (
  url: string, signal: AbortSignal,
) => Promise<BojPolicyDocumentV1>;

export function assertBojPolicyServerV1(): void {
  if (typeof window !== "undefined") throw new Error("BoJ policy evidence is server-only.");
}

export function isBojCivilDateV1(value: unknown): value is string {
  return typeof value === "string" && /^[1-9]\d{3}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(value) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

/** Explicit English decision HTML only; no discovery, PDF conversion or arbitrary BoJ URL. */
export function bojPolicyDocumentUrlV1(decisionDate: string): string {
  if (!isBojCivilDateV1(decisionDate) || decisionDate < "2000-01-01") {
    throw new BojPolicyTransportError("invalid-request");
  }
  return `https://www.boj.or.jp/en/mopo/mpmdeci/state_${decisionDate.slice(0, 4)}/k${decisionDate.slice(2).replaceAll("-", "")}a.htm`;
}

export function assertBojPolicyUrlV1(url: string): string {
  const match = /^https:\/\/www\.boj\.or\.jp\/en\/mopo\/mpmdeci\/state_(\d{4})\/k(\d{2})(\d{2})(\d{2})a\.htm$/.exec(url);
  if (match === null || match[1]!.slice(2) !== match[2]) throw new BojPolicyTransportError("invalid-request");
  const date = `${match[1]}-${match[3]}-${match[4]}`;
  if (bojPolicyDocumentUrlV1(date) !== url) throw new BojPolicyTransportError("invalid-request");
  return date;
}

/** Dependency-only transport: no default fetch, retries, cache, timers or environment reads. */
export async function loadBojPolicyDocumentV1(
  url: string, dependencies: BojPolicyTransportDependenciesV1,
): Promise<BojPolicyDocumentV1> {
  assertBojPolicyServerV1();
  assertBojPolicyUrlV1(url);
  const { fetchImpl, signal } = dependencies;
  let response: Response | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let consumed = false;
  try {
    response = await cancellable(() => fetchImpl(url, {
      method: "GET", headers: { Accept: "text/html" }, redirect: "error", cache: "no-store", signal,
    }), signal);
    // Reject even same-host redirects: the requested dated publication is the bound source identity.
    if (response.redirected || (response.url !== "" && response.url !== url)) {
      throw new BojPolicyTransportError("redirect");
    }
    if (!response.ok) throw new BojPolicyTransportError("http");
    const contentType = response.headers.get("content-type") ?? "";
    if (!/^text\/html(?:\s*;\s*charset\s*=\s*"?utf-8"?)?\s*$/i.test(contentType)) {
      throw new BojPolicyTransportError("content-type");
    }
    const length = response.headers.get("content-length");
    if (length !== null) {
      if (!/^(?:0|[1-9]\d*)$/.test(length)) throw new BojPolicyTransportError("content-length");
      if (Number(length) > BOJ_POLICY_MAX_RESPONSE_BYTES_V1) throw new BojPolicyTransportError("response-too-large");
    }
    if (response.body === null) throw new BojPolicyTransportError("missing-body");
    reader = response.body.getReader();
    const bytes = new Uint8Array(BOJ_POLICY_MAX_RESPONSE_BYTES_V1);
    let total = 0;
    while (true) {
      const activeReader = reader;
      const chunk = await cancellable(() => activeReader.read(), signal);
      if (chunk.done) break;
      if (chunk.value.byteLength > bytes.length - total) throw new BojPolicyTransportError("response-too-large");
      bytes.set(chunk.value, total);
      total += chunk.value.byteLength;
    }
    consumed = true;
    let html: string;
    try { html = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, total)); }
    catch (error) {
      if (error instanceof TypeError && "code" in error && error.code === "ERR_ENCODING_INVALID_ENCODED_DATA") {
        throw new BojPolicyTransportError("invalid-encoding");
      }
      throw error;
    }
    return Object.freeze({ url, html });
  } catch (error) {
    if (error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name)) {
      throw new BojPolicyTransportError("aborted");
    }
    // Only recognized native fetch failures are provider errors. Dependency defects propagate.
    if (error instanceof TypeError && ["fetch failed", "terminated"].includes(error.message) && "cause" in error &&
        error.cause instanceof Error && !(error.cause instanceof TypeError || error.cause instanceof ReferenceError)) {
      if (error.cause.message === "unexpected redirect") throw new BojPolicyTransportError("redirect");
      if ("code" in error.cause && ["ENOTFOUND", "EAI_AGAIN", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT",
        "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "CERT_HAS_EXPIRED",
        "ERR_TLS_CERT_ALTNAME_INVALID", "EACCES"].includes(String(error.cause.code))) {
        throw new BojPolicyTransportError("network");
      }
    }
    throw error;
  } finally {
    if (!consumed) {
      try { void (reader !== undefined ? reader.cancel() : response?.body?.cancel())?.catch(() => {}); }
      catch { /* Preserve the original failure. */ }
    }
    try { reader?.releaseLock(); } catch { /* Preserve the original failure. */ }
  }
}

async function cancellable<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new BojPolicyTransportError("aborted");
  let abort: () => void = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(new BojPolicyTransportError("aborted"));
    signal.addEventListener("abort", abort, { once: true });
  });
  try { return await Promise.race([operation(), cancelled]); }
  finally { signal.removeEventListener("abort", abort); }
}
