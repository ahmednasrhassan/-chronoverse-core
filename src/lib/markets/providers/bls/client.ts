export const BLS_TIMESERIES_API_URL_V1 =
  "https://api.bls.gov/publicAPI/v2/timeseries/data/" as const;
export const BLS_CPI_ALL_ITEMS_NSA_SERIES_ID_V1 = "CUUR0000SA0" as const;
export const BLS_LABOR_SERIES_IDS_V1 = Object.freeze([
  "CES0000000001", "LNS14000000", "CES0500000003",
] as const);
export const BLS_MAX_RESPONSE_BYTES_V1 = 2 * 1024 * 1024;

/** Static diagnostics only: upstream messages/request bodies are never exposed. */
export class BlsTransportError extends Error {
  constructor(readonly code:
    | "invalid-request" | "http" | "redirect" | "content-type" | "content-length"
    | "missing-body" | "response-too-large" | "invalid-json" | "schema"
    | "application-failure" | "network" | "aborted",
  ) {
    super(`BLS transport failed: ${code}.`);
    this.name = "BlsTransportError";
  }
}

export interface BlsTimeseriesRequestV1 {
  readonly seriesId: typeof BLS_CPI_ALL_ITEMS_NSA_SERIES_ID_V1;
  readonly startYear: number;
  readonly endYear: number;
}

export interface BlsTimeseriesResponseV1 {
  readonly sourceUrl: typeof BLS_TIMESERIES_API_URL_V1;
  readonly payload: unknown;
}

/** Exactly the locked labor bundle; not an arbitrary multi-series API. */
export interface BlsLaborTimeseriesRequestV1 {
  readonly seriesIds: typeof BLS_LABOR_SERIES_IDS_V1;
  readonly startYear: number;
  readonly endYear: number;
}
export type BlsLaborTimeseriesLoaderV1 = (
  request: BlsLaborTimeseriesRequestV1, signal: AbortSignal,
) => Promise<BlsTimeseriesResponseV1>;

export type BlsTimeseriesLoaderV1 = (
  request: BlsTimeseriesRequestV1,
  signal: AbortSignal,
) => Promise<BlsTimeseriesResponseV1>;

export interface BlsTransportDependenciesV1 {
  readonly signal: AbortSignal;
  readonly fetchImpl?: typeof fetch;
}

export function assertBlsTimeseriesRequestV1(request: BlsTimeseriesRequestV1): void {
  if (request.seriesId !== BLS_CPI_ALL_ITEMS_NSA_SERIES_ID_V1) {
    throw new BlsTransportError("invalid-request");
  }
  assertYearRange(request);
}

export function assertBlsLaborTimeseriesRequestV1(request: BlsLaborTimeseriesRequestV1): void {
  if (!Array.isArray(request.seriesIds) || request.seriesIds.length !== BLS_LABOR_SERIES_IDS_V1.length ||
      BLS_LABOR_SERIES_IDS_V1.some((id, index) => request.seriesIds[index] !== id)) {
    throw new BlsTransportError("invalid-request");
  }
  assertYearRange(request);
}

function assertYearRange(request: { readonly startYear: number; readonly endYear: number }): void {
  if (!Number.isSafeInteger(request.startYear) || !Number.isSafeInteger(request.endYear) ||
      request.startYear < 1000 || request.endYear > 9999 ||
      request.endYear < request.startYear || request.endYear - request.startYear >= 10) {
    throw new BlsTransportError("invalid-request");
  }
}

/** Validates the application envelope independently of observation normalization. */
export function assertBlsResponseEnvelopeV1(payload: unknown, requestedIds?: readonly string[]): void {
  if (!isRecord(payload) || typeof payload.status !== "string" ||
      !Array.isArray(payload.message) || payload.message.some((entry) => typeof entry !== "string")) {
    throw new BlsTransportError("schema");
  }
  // Even a successful status with warnings can denote incomplete/rejected coverage.
  if (payload.status !== "REQUEST_SUCCEEDED" || payload.message.length !== 0) {
    throw new BlsTransportError("application-failure");
  }
  if (!isRecord(payload.Results) || !Array.isArray(payload.Results.series) ||
      payload.Results.series.length !== (requestedIds?.length ?? 1)) {
    throw new BlsTransportError("schema");
  }
  const seen = new Set<string>();
  for (const series of payload.Results.series) {
    if (!isRecord(series) || typeof series.seriesID !== "string" || !Array.isArray(series.data)) {
      throw new BlsTransportError("schema");
    }
    if (requestedIds !== undefined) {
      if (!requestedIds.includes(series.seriesID) || seen.has(series.seriesID)) {
        throw new BlsTransportError("schema");
      }
      seen.add(series.seriesID);
    }
  }
  if (requestedIds?.some((id) => !seen.has(id))) throw new BlsTransportError("schema");
}

/** No registration-key/env access, cache, retry or import-time request. Caller owns deadline. */
export async function loadBlsTimeseriesV1(
  request: BlsTimeseriesRequestV1,
  dependencies: BlsTransportDependenciesV1,
): Promise<BlsTimeseriesResponseV1> {
  if (typeof window !== "undefined") throw new Error("BLS acquisition is server-only.");
  assertBlsTimeseriesRequestV1(request);
  return loadBlsResponseV1(request, [request.seriesId], dependencies);
}

export async function loadBlsLaborTimeseriesV1(
  request: BlsLaborTimeseriesRequestV1,
  dependencies: BlsTransportDependenciesV1,
): Promise<BlsTimeseriesResponseV1> {
  if (typeof window !== "undefined") throw new Error("BLS acquisition is server-only.");
  assertBlsLaborTimeseriesRequestV1(request);
  return loadBlsResponseV1(request, BLS_LABOR_SERIES_IDS_V1, dependencies, BLS_LABOR_SERIES_IDS_V1);
}

/** Shared bounded transport; CPI keeps its existing envelope contract. */
async function loadBlsResponseV1(
  request: { readonly startYear: number; readonly endYear: number },
  seriesIds: readonly string[],
  dependencies: BlsTransportDependenciesV1,
  requestedIds?: readonly string[],
): Promise<BlsTimeseriesResponseV1> {
  const { signal } = dependencies;
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const usesDefaultFetch = dependencies.fetchImpl === undefined;
  let response: Response | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let consumed = false;
  try {
    response = await cancellable(() => fetchImpl(BLS_TIMESERIES_API_URL_V1, {
      method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ seriesid: seriesIds, startyear: String(request.startYear),
        endyear: String(request.endYear) }),
      redirect: "error", cache: "no-store", signal,
    }), signal);
    if (!response.ok) throw new BlsTransportError("http");
    if (response.redirected || (response.url !== "" && response.url !== BLS_TIMESERIES_API_URL_V1)) {
      throw new BlsTransportError("redirect");
    }
    const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (mediaType !== "application/json") throw new BlsTransportError("content-type");
    const length = response.headers.get("content-length");
    if (length !== null) {
      if (!/^(?:0|[1-9]\d*)$/.test(length)) throw new BlsTransportError("content-length");
      if (Number(length) > BLS_MAX_RESPONSE_BYTES_V1) throw new BlsTransportError("response-too-large");
    }
    if (response.body === null) throw new BlsTransportError("missing-body");
    reader = response.body.getReader();
    const bytes = new Uint8Array(BLS_MAX_RESPONSE_BYTES_V1);
    let total = 0;
    while (true) {
      const activeReader = reader;
      const cell = await cancellable(() => activeReader.read(), signal);
      if (cell.done) break;
      if (cell.value.byteLength > bytes.length - total) throw new BlsTransportError("response-too-large");
      bytes.set(cell.value, total);
      total += cell.value.byteLength;
    }
    consumed = true;
    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, total)));
    } catch (error) {
      if (error instanceof SyntaxError || (error instanceof TypeError && "code" in error &&
          error.code === "ERR_ENCODING_INVALID_ENCODED_DATA")) throw new BlsTransportError("invalid-json");
      throw error;
    }
    assertBlsResponseEnvelopeV1(payload, requestedIds);
    return Object.freeze({ sourceUrl: BLS_TIMESERIES_API_URL_V1, payload });
  } catch (error) {
    if (error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name)) {
      throw new BlsTransportError("aborted");
    }
    // Injected transports report expected failures through BlsTransportError.
    // Unrelated programming defects propagate unchanged.
    if (usesDefaultFetch && error instanceof TypeError && error.message === "fetch failed" &&
        "cause" in error && error.cause instanceof Error &&
        !(error.cause instanceof TypeError || error.cause instanceof ReferenceError)) {
      throw new BlsTransportError("network");
    }
    if (usesDefaultFetch && error instanceof TypeError && error.message === "terminated" &&
        "cause" in error && error.cause instanceof Error && "code" in error.cause &&
        ["UND_ERR_SOCKET", "UND_ERR_BODY_TIMEOUT", "ECONNRESET"].includes(String(error.cause.code))) {
      throw new BlsTransportError("network");
    }
    throw error;
  } finally {
    if (!consumed) {
      try {
        if (reader !== undefined) await reader.cancel();
        else await response?.body?.cancel();
      } catch { /* Preserve original failure. */ }
    }
    try { reader?.releaseLock(); } catch { /* Preserve original failure. */ }
  }
}

async function cancellable<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new BlsTransportError("aborted");
  let abort: () => void = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(new BlsTransportError("aborted"));
    signal.addEventListener("abort", abort, { once: true });
  });
  try { return await Promise.race([operation(), cancelled]); }
  finally { signal.removeEventListener("abort", abort); }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
