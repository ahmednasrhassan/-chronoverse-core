export const SNB_POLICY_MAX_RESPONSE_BYTES_V1 = 2 * 1024 * 1024;

export class SnbPolicyTransportError extends Error {
  constructor(readonly code:
    | "invalid-request" | "unsupported-regime" | "http" | "redirect" | "content-type" | "content-length"
    | "missing-body" | "response-too-large" | "invalid-encoding" | "network" | "aborted") {
    super(`SNB policy transport failed: ${code}.`);
    this.name = "SnbPolicyTransportError";
  }
}

export interface SnbPolicyTransportDependenciesV1 {
  readonly fetchImpl: typeof fetch;
  readonly signal: AbortSignal;
}

export interface SnbPolicyDocumentV1 {
  readonly url: string;
  readonly html: string;
}

export type SnbPolicyDocumentLoaderV1 = (
  url: string, signal: AbortSignal,
) => Promise<SnbPolicyDocumentV1>;

export function assertSnbPolicyServerV1(): void {
  if (typeof window !== "undefined") throw new Error("SNB policy evidence is server-only.");
}

export function isSnbCivilDateV1(value: unknown): value is string {
  return typeof value === "string" && /^[1-9]\d{3}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(value) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export const SNB_MONTHS_V1 = Object.freeze(["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]);
export const SNB_POLICY_REGIME_START_V1 = "2019-06-13" as const;

/** Paths verified from the official decision index; one explicit source suffix exception. */
export function snbPolicyDocumentUrlV1(decisionDate: string): string {
  if (!isSnbCivilDateV1(decisionDate)) throw new SnbPolicyTransportError("invalid-request");
  if (decisionDate < SNB_POLICY_REGIME_START_V1) throw new SnbPolicyTransportError("unsupported-regime");
  const id = 'pre_' + decisionDate.replaceAll('-', '') + (decisionDate === '2025-06-19' ? '_2' : '');
  const family = decisionDate >= '2023-12-14' ? 'press-releases-restricted' : 'press-releases/' + decisionDate.slice(0, 4);
  return 'https://www.snb.ch/en/publications/communication/' + family + '/' + id;
}

export function assertSnbPolicyUrlV1(url: string): string {
  const match = /^https:\/\/www\.snb\.ch\/en\/publications\/communication\/(?:press-releases-restricted|press-releases\/[1-9]\d{3})\/pre_(\d{4})(\d{2})(\d{2})(?:_2)?$/.exec(url);
  if (match === null) throw new SnbPolicyTransportError("invalid-request");
  const date = match[1] + '-' + match[2] + '-' + match[3];
  if (url !== snbPolicyDocumentUrlV1(date)) throw new SnbPolicyTransportError("invalid-request");
  return date;
}

/** Dependency-only transport: no default fetch, retries, cache, timers or environment reads. */
export async function loadSnbPolicyDocumentV1(
  url: string, dependencies: SnbPolicyTransportDependenciesV1,
): Promise<SnbPolicyDocumentV1> {
  assertSnbPolicyServerV1();
  assertSnbPolicyUrlV1(url);
  const { fetchImpl, signal } = dependencies;
  let response: Response | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let consumed = false;
  try {
    response = await cancellable(() => fetchImpl(url, {
      method: "GET", headers: { Accept: "text/html" }, redirect: "error", cache: "no-store", signal,
    }), signal);
    // Reject even same-host redirects: the requested publication is the bound source identity.
    if (response.redirected || (response.url !== "" && response.url !== url)) {
      throw new SnbPolicyTransportError("redirect");
    }
    if (response.status !== 200) throw new SnbPolicyTransportError("http");
    const contentType = response.headers.get("content-type") ?? "";
    if (!/^text\/html(?:\s*;\s*charset\s*=\s*"?utf-8"?)?\s*$/i.test(contentType)) {
      throw new SnbPolicyTransportError("content-type");
    }
    const length = response.headers.get("content-length");
    if (length !== null) {
      if (!/^(?:0|[1-9]\d*)$/.test(length)) throw new SnbPolicyTransportError("content-length");
      if (Number(length) > SNB_POLICY_MAX_RESPONSE_BYTES_V1) throw new SnbPolicyTransportError("response-too-large");
    }
    if (response.body === null) throw new SnbPolicyTransportError("missing-body");
    reader = response.body.getReader();
    const bytes = new Uint8Array(SNB_POLICY_MAX_RESPONSE_BYTES_V1);
    let total = 0;
    while (true) {
      const activeReader = reader;
      const chunk = await cancellable(() => activeReader.read(), signal);
      if (chunk.done) break;
      if (chunk.value.byteLength > bytes.length - total) throw new SnbPolicyTransportError("response-too-large");
      bytes.set(chunk.value, total);
      total += chunk.value.byteLength;
    }
    consumed = true;
    let html: string;
    try { html = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, total)); }
    catch (error) {
      if (error instanceof TypeError && "code" in error && error.code === "ERR_ENCODING_INVALID_ENCODED_DATA") {
        throw new SnbPolicyTransportError("invalid-encoding");
      }
      throw error;
    }
    return Object.freeze({ url, html });
  } catch (error) {
    if (error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name)) {
      throw new SnbPolicyTransportError("aborted");
    }
    // Only recognized native fetch failures are provider errors. Dependency defects propagate.
    if (error instanceof TypeError && ["fetch failed", "terminated"].includes(error.message) && "cause" in error &&
        error.cause instanceof Error && !(error.cause instanceof TypeError || error.cause instanceof ReferenceError)) {
      if (error.cause.message === "unexpected redirect") throw new SnbPolicyTransportError("redirect");
      if ("code" in error.cause && ["ENOTFOUND", "EAI_AGAIN", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT",
        "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "CERT_HAS_EXPIRED",
        "ERR_TLS_CERT_ALTNAME_INVALID", "EACCES"].includes(String(error.cause.code))) {
        throw new SnbPolicyTransportError("network");
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
  if (signal.aborted) throw new SnbPolicyTransportError("aborted");
  let abort: () => void = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(new SnbPolicyTransportError("aborted"));
    signal.addEventListener("abort", abort, { once: true });
  });
  try { return await Promise.race([operation(), cancelled]); }
  finally { signal.removeEventListener("abort", abort); }
}
