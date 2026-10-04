export const BOE_BANK_RATE_MAX_RESPONSE_BYTES_V1 = 2 * 1024 * 1024;

export class BoeBankRateTransportError extends Error {
  constructor(readonly code:
    | "invalid-request" | "http" | "redirect" | "content-type" | "content-length"
    | "missing-body" | "response-too-large" | "invalid-encoding" | "network" | "aborted") {
    super(`BoE policy transport failed: ${code}.`);
    this.name = "BoeBankRateTransportError";
  }
}

export interface BoeBankRateTransportDependenciesV1 {
  readonly fetchImpl: typeof fetch;
  readonly signal: AbortSignal;
}

export interface BoeBankRateDocumentV1 {
  readonly url: string;
  readonly html: string;
}

export type BoeBankRateDocumentLoaderV1 = (
  url: string, signal: AbortSignal,
) => Promise<BoeBankRateDocumentV1>;

export function assertBoeBankRateServerV1(): void {
  if (typeof window !== "undefined") throw new Error("BoE policy evidence is server-only.");
}

export function isBoeCivilDateV1(value: unknown): value is string {
  return typeof value === "string" && /^[1-9]\d{3}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(value) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export const BOE_MONTHS_V1 = Object.freeze(["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]);
export const BOE_MAY_2025_RELEASE_NOTICE_URL_V1 = "https://www.bankofengland.co.uk/news/2025/may/statement-on-the-timing-of-the-mpr-and-mpc-minutes";

/** Explicit dated request; the month URL does not prove the publication day. */
export function boeBankRateDocumentUrlV1(publicationDate: string): string {
  if (!isBoeCivilDateV1(publicationDate) || publicationDate < "2000-01-01") throw new BoeBankRateTransportError("invalid-request");
  const year = publicationDate.slice(0, 4);
  return `https://www.bankofengland.co.uk/monetary-policy-summary-and-minutes/${year}/${BOE_MONTHS_V1[Number(publicationDate.slice(5, 7)) - 1]!.toLowerCase()}-${year}`;
}

export function assertBoeBankRateDecisionUrlV1(url: string): string {
  const match = /^https:\/\/www\.bankofengland\.co\.uk\/monetary-policy-summary-and-minutes\/([2-9]\d{3})\/([a-z]+)-([2-9]\d{3})$/.exec(url);
  const month = match === null ? -1 : BOE_MONTHS_V1.findIndex((name) => name.toLowerCase() === match[2]);
  if (match === null || match[1] !== match[3] || month < 0) throw new BoeBankRateTransportError("invalid-request");
  return `${match[1]}-${String(month + 1).padStart(2, "0")}`;
}

export function assertBoeBankRateUrlV1(url: string): void {
  if (url !== BOE_MAY_2025_RELEASE_NOTICE_URL_V1) assertBoeBankRateDecisionUrlV1(url);
}

/** Dependency-only transport: no default fetch, retries, cache, timers or environment reads. */
export async function loadBoeBankRateDocumentV1(
  url: string, dependencies: BoeBankRateTransportDependenciesV1,
): Promise<BoeBankRateDocumentV1> {
  assertBoeBankRateServerV1();
  assertBoeBankRateUrlV1(url);
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
      throw new BoeBankRateTransportError("redirect");
    }
    if (response.status !== 200) throw new BoeBankRateTransportError("http");
    const contentType = response.headers.get("content-type") ?? "";
    if (!/^text\/html(?:\s*;\s*charset\s*=\s*"?utf-8"?)?\s*$/i.test(contentType)) {
      throw new BoeBankRateTransportError("content-type");
    }
    const length = response.headers.get("content-length");
    if (length !== null) {
      if (!/^(?:0|[1-9]\d*)$/.test(length)) throw new BoeBankRateTransportError("content-length");
      if (Number(length) > BOE_BANK_RATE_MAX_RESPONSE_BYTES_V1) throw new BoeBankRateTransportError("response-too-large");
    }
    if (response.body === null) throw new BoeBankRateTransportError("missing-body");
    reader = response.body.getReader();
    const bytes = new Uint8Array(BOE_BANK_RATE_MAX_RESPONSE_BYTES_V1);
    let total = 0;
    while (true) {
      const activeReader = reader;
      const chunk = await cancellable(() => activeReader.read(), signal);
      if (chunk.done) break;
      if (chunk.value.byteLength > bytes.length - total) throw new BoeBankRateTransportError("response-too-large");
      bytes.set(chunk.value, total);
      total += chunk.value.byteLength;
    }
    consumed = true;
    let html: string;
    try { html = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, total)); }
    catch (error) {
      if (error instanceof TypeError && "code" in error && error.code === "ERR_ENCODING_INVALID_ENCODED_DATA") {
        throw new BoeBankRateTransportError("invalid-encoding");
      }
      throw error;
    }
    return Object.freeze({ url, html });
  } catch (error) {
    if (error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name)) {
      throw new BoeBankRateTransportError("aborted");
    }
    // Only recognized native fetch failures are provider errors. Dependency defects propagate.
    if (error instanceof TypeError && ["fetch failed", "terminated"].includes(error.message) && "cause" in error &&
        error.cause instanceof Error && !(error.cause instanceof TypeError || error.cause instanceof ReferenceError)) {
      if (error.cause.message === "unexpected redirect") throw new BoeBankRateTransportError("redirect");
      if ("code" in error.cause && ["ENOTFOUND", "EAI_AGAIN", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT",
        "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "CERT_HAS_EXPIRED",
        "ERR_TLS_CERT_ALTNAME_INVALID", "EACCES"].includes(String(error.cause.code))) {
        throw new BoeBankRateTransportError("network");
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
  if (signal.aborted) throw new BoeBankRateTransportError("aborted");
  let abort: () => void = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(new BoeBankRateTransportError("aborted"));
    signal.addEventListener("abort", abort, { once: true });
  });
  try { return await Promise.race([operation(), cancelled]); }
  finally { signal.removeEventListener("abort", abort); }
}
