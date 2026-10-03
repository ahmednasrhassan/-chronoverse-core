export const US_POLICY_MAX_RESPONSE_BYTES_V1 = 2 * 1024 * 1024;
export const EFFR_API_URL_V1 = "https://markets.newyorkfed.org/api/rates/unsecured/effr/search.json" as const;
export class UsPolicyTransportError extends Error {
  constructor(readonly code: "invalid-request" | "http" | "redirect" | "content-type" | "content-length" |
    "missing-body" | "response-too-large" | "invalid-encoding" | "network" | "aborted") {
    super(`U.S. policy transport failed: ${code}.`); this.name = "UsPolicyTransportError";
  }
}
export interface UsPolicyTransportDependenciesV1 { readonly fetchImpl: typeof fetch; readonly signal: AbortSignal }
export function assertUsPolicyServerV1(): void {
  if (typeof window !== "undefined") throw new Error("U.S. policy acquisition is server-only.");
}
export function isCivilDateV1(value: unknown): value is string {
  return typeof value === "string" && /^[1-9]\d{3}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(value) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
export function fomcDocumentUrlV1(date: string, implementation = false): string {
  if (!isCivilDateV1(date)) throw new UsPolicyTransportError("invalid-request");
  return `https://www.federalreserve.gov/newsevents/pressreleases/monetary${date.replaceAll("-", "")}a${implementation ? "1" : ""}.htm`;
}
export function assertFomcUrlV1(url: string): void {
  const match = /^https:\/\/www\.federalreserve\.gov\/newsevents\/pressreleases\/monetary(\d{4})(\d{2})(\d{2})a(?:1)?\.htm$/.exec(url);
  if (!match || !isCivilDateV1(`${match[1]}-${match[2]}-${match[3]}`)) throw new UsPolicyTransportError("invalid-request");
}
export interface EffrRequestV1 { readonly startDate: string; readonly endDate: string }
export function effrRequestUrlV1(request: EffrRequestV1): string {
  if (!isCivilDateV1(request.startDate) || !isCivilDateV1(request.endDate) || request.startDate < "2016-03-01" ||
      request.endDate < request.startDate || (Date.parse(request.endDate) - Date.parse(request.startDate)) / 86400000 > 30) {
    throw new UsPolicyTransportError("invalid-request");
  }
  return `${EFFR_API_URL_V1}?${new URLSearchParams({ startDate: request.startDate, endDate: request.endDate })}`;
}
function assertSource(url: string, media: "text/html" | "application/json"): void {
  if (media === "text/html") { assertFomcUrlV1(url); return; }
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new UsPolicyTransportError("invalid-request"); }
  if (Array.from(parsed.searchParams.keys()).sort().join(",") !== "endDate,startDate" ||
      effrRequestUrlV1({ startDate: parsed.searchParams.get("startDate") ?? "", endDate: parsed.searchParams.get("endDate") ?? "" }) !== url) {
    throw new UsPolicyTransportError("invalid-request");
  }
}
/** Exactly allowlisted Fed HTML or bounded official EFFR JSON. No retries/cache/env wiring. */
export async function loadUsPolicyTextV1(url: string, media: "text/html" | "application/json", dependencies: UsPolicyTransportDependenciesV1): Promise<string> {
  assertUsPolicyServerV1(); assertSource(url, media);
  const { signal, fetchImpl } = dependencies;
  let response: Response | undefined; let reader: ReadableStreamDefaultReader<Uint8Array> | undefined; let consumed = false;
  try {
    response = await cancellable(() => fetchImpl(url, { method: "GET", headers: { Accept: media }, redirect: "error", cache: "no-store", signal }), signal);
    if (response.redirected || (response.url !== "" && response.url !== url)) throw new UsPolicyTransportError("redirect");
    if (!response.ok) throw new UsPolicyTransportError("http");
    if (response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== media) throw new UsPolicyTransportError("content-type");
    const length = response.headers.get("content-length");
    if (length !== null) {
      if (!/^(?:0|[1-9]\d*)$/.test(length)) throw new UsPolicyTransportError("content-length");
      if (Number(length) > US_POLICY_MAX_RESPONSE_BYTES_V1) throw new UsPolicyTransportError("response-too-large");
    }
    if (response.body === null) throw new UsPolicyTransportError("missing-body");
    reader = response.body.getReader(); const bytes = new Uint8Array(US_POLICY_MAX_RESPONSE_BYTES_V1); let total = 0;
    while (true) {
      const active = reader; const cell = await cancellable(() => active.read(), signal); if (cell.done) break;
      if (cell.value.byteLength > bytes.length - total) throw new UsPolicyTransportError("response-too-large");
      bytes.set(cell.value, total); total += cell.value.byteLength;
    }
    consumed = true;
    try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, total)); }
    catch (error) {
      if (error instanceof TypeError && "code" in error && error.code === "ERR_ENCODING_INVALID_ENCODED_DATA") throw new UsPolicyTransportError("invalid-encoding");
      throw error;
    }
  } catch (error) {
    if (error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name)) throw new UsPolicyTransportError("aborted");
    if (error instanceof TypeError && ["fetch failed", "terminated"].includes(error.message) && "cause" in error &&
        error.cause instanceof Error && !(error.cause instanceof TypeError || error.cause instanceof ReferenceError)) {
      if (error.cause.message === "unexpected redirect") throw new UsPolicyTransportError("redirect");
      if ("code" in error.cause && ["ENOTFOUND", "EAI_AGAIN", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "UND_ERR_SOCKET",
        "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "CERT_HAS_EXPIRED", "ERR_TLS_CERT_ALTNAME_INVALID"].includes(String(error.cause.code))) {
        throw new UsPolicyTransportError("network");
      }
    }
    throw error;
  } finally {
    if (!consumed) try { void (reader !== undefined ? reader.cancel() : response?.body?.cancel())?.catch(() => {}); } catch { /* Preserve original failure. */ }
    try { reader?.releaseLock(); } catch { /* Preserve original failure. */ }
  }
}
async function cancellable<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new UsPolicyTransportError("aborted");
  let abort: () => void = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(new UsPolicyTransportError("aborted")); signal.addEventListener("abort", abort, { once: true });
  });
  try { return await Promise.race([operation(), cancelled]); } finally { signal.removeEventListener("abort", abort); }
}
