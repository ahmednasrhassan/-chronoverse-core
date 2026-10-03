export const BEA_API_URL_V1 = "https://apps.bea.gov/api/data/" as const;
export const BEA_MAX_RESPONSE_BYTES_V1 = 2 * 1024 * 1024;

export type BeaRequestV1 = {
  readonly dataset: "NIPA";
  readonly years: readonly number[];
} & ({ readonly tableName: "T10106"; readonly frequency: "Q" }
  | { readonly tableName: "T20804"; readonly frequency: "M" });

/** Credentials are transport dependencies, never returned provenance or diagnostics. */
export interface BeaTransportDependenciesV1 {
  readonly userId: string;
  readonly fetchImpl: typeof fetch;
  readonly signal: AbortSignal;
}
export interface BeaResponseV1 {
  readonly sourceUrl: typeof BEA_API_URL_V1;
  readonly request: BeaRequestV1;
  readonly data: readonly unknown[];
  readonly notes: readonly unknown[];
}
export type BeaLoaderV1 = (request: BeaRequestV1, signal: AbortSignal) => Promise<BeaResponseV1>;

export class BeaTransportError extends Error {
  constructor(readonly code:
    | "invalid-request" | "http" | "redirect" | "content-type" | "content-length"
    | "missing-body" | "response-too-large" | "invalid-json" | "schema"
    | "application-failure" | "network" | "aborted",
  ) {
    super(`BEA transport failed: ${code}.`);
    this.name = "BeaTransportError";
  }
}

export function assertBeaServerV1(): void {
  if (typeof window !== "undefined") throw new Error("BEA acquisition is server-only.");
}

/** One table/frequency, at most five explicitly selected years; no ALL/X history. */
export function assertBeaRequestV1(request: BeaRequestV1): void {
  if (!isRecord(request) || request.dataset !== "NIPA" ||
      Object.keys(request).some((key) => !["dataset", "tableName", "frequency", "years"].includes(key)) ||
      !((request.tableName === "T10106" && request.frequency === "Q") ||
        (request.tableName === "T20804" && request.frequency === "M")) ||
      !Array.isArray(request.years) || request.years.length === 0 || request.years.length > 5 ||
      Array.from(request.years).some((year) => !Number.isSafeInteger(year) || year < 1000 || year > 9999) ||
      new Set(request.years).size !== request.years.length) throw new BeaTransportError("invalid-request");
}

/** BEA guide Appendix B; no upstream Request, Error, or production-time metadata escapes. */
export function parseBeaEnvelopeV1(payload: unknown, request: BeaRequestV1): BeaResponseV1 {
  assertBeaRequestV1(request);
  if (!isRecord(payload) || !isRecord(payload.BEAAPI)) throw new BeaTransportError("schema");
  const api = payload.BEAAPI;
  if (api.Error !== undefined || (isRecord(api.Results) && api.Results.Error !== undefined)) {
    throw new BeaTransportError("application-failure");
  }
  if (!isRecord(api.Request) || !Array.isArray(api.Request.RequestParam) || !isRecord(api.Results) ||
      !Array.isArray(api.Results.Data) || !Array.isArray(api.Results.Notes)) throw new BeaTransportError("schema");
  const expected = new Map([
    ["METHOD", "GETDATA"], ["DATASETNAME", "NIPA"], ["TABLENAME", request.tableName],
    ["FREQUENCY", request.frequency], ["YEAR", [...request.years].sort((a, b) => a - b).join(",")],
    ["RESULTFORMAT", "JSON"],
  ]);
  const seen = new Set<string>();
  for (const param of api.Request.RequestParam) {
    if (!isRecord(param) || typeof param.ParameterName !== "string") throw new BeaTransportError("schema");
    const name = param.ParameterName.toUpperCase();
    // Do not inspect or retain the credential echo.
    if (!expected.has(name)) continue;
    if (seen.has(name) || typeof param.ParameterValue !== "string") throw new BeaTransportError("schema");
    const value = name === "YEAR" ? param.ParameterValue.split(",").sort().join(",") : param.ParameterValue.toUpperCase();
    if (value !== expected.get(name)) throw new BeaTransportError("schema");
    seen.add(name);
  }
  if (seen.size !== expected.size) throw new BeaTransportError("schema");
  // Whitelist source fact fields. Neither diagnostics nor request echoes are exposed.
  const data = Array.from(api.Results.Data).map((row: unknown) => {
    if (!isRecord(row)) throw new BeaTransportError("schema");
    const result: Record<string, unknown> = {};
    for (const field of ["TableName", "SeriesCode", "LineNumber", "LineDescription", "TimePeriod",
      "METRIC_NAME", "Metric_Name", "CL_UNIT", "UNIT_MULT", "DataValue", "NoteRef"]) {
      if (Object.hasOwn(row, field)) result[field] = row[field];
    }
    return Object.freeze(result);
  });
  const notes = Array.from(api.Results.Notes).map((note: unknown) => {
    if (!isRecord(note) || typeof note.NoteRef !== "string" || typeof note.NoteText !== "string") {
      throw new BeaTransportError("schema");
    }
    return Object.freeze({ NoteRef: note.NoteRef, NoteText: note.NoteText });
  });
  return Object.freeze({ sourceUrl: BEA_API_URL_V1,
    request: Object.freeze({ ...request, years: Object.freeze([...request.years].sort((a, b) => a - b)) }),
    data: Object.freeze(data), notes: Object.freeze(notes) });
}

/** Inactive, injected GET transport. Caller owns the deadline. No retries or env reads. */
export async function loadBeaResponseV1(request: BeaRequestV1, dependencies: BeaTransportDependenciesV1): Promise<BeaResponseV1> {
  assertBeaServerV1();
  assertBeaRequestV1(request);
  // The guide requires a registered 36-character identifier; never quote its value.
  if (typeof dependencies.userId !== "string" ||
      dependencies.userId.length !== 36 || /\s/.test(dependencies.userId) ||
      [...dependencies.userId].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
    throw new BeaTransportError("invalid-request");
  }
  const { signal, fetchImpl } = dependencies;
  const url = new URL(BEA_API_URL_V1);
  url.search = new URLSearchParams({ UserID: dependencies.userId, method: "GetData", datasetname: "NIPA",
    TableName: request.tableName, Frequency: request.frequency,
    Year: [...request.years].sort((a, b) => a - b).join(","), ResultFormat: "JSON" }).toString();
  let response: Response | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let consumed = false;
  try {
    response = await cancellable(() => fetchImpl(url.toString(), {
      method: "GET", headers: { Accept: "application/json" }, redirect: "error", cache: "no-store", signal,
    }), signal);
    if (response.redirected || (response.url !== "" && response.url !== url.toString())) throw new BeaTransportError("redirect");
    if (!response.ok) throw new BeaTransportError("http");
    if (response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
      throw new BeaTransportError("content-type");
    }
    const length = response.headers.get("content-length");
    if (length !== null) {
      if (!/^(?:0|[1-9]\d*)$/.test(length)) throw new BeaTransportError("content-length");
      if (Number(length) > BEA_MAX_RESPONSE_BYTES_V1) throw new BeaTransportError("response-too-large");
    }
    if (response.body === null) throw new BeaTransportError("missing-body");
    reader = response.body.getReader();
    const bytes = new Uint8Array(BEA_MAX_RESPONSE_BYTES_V1);
    let total = 0;
    while (true) {
      const activeReader = reader;
      const cell = await cancellable(() => activeReader.read(), signal);
      if (cell.done) break;
      if (cell.value.byteLength > bytes.length - total) throw new BeaTransportError("response-too-large");
      bytes.set(cell.value, total); total += cell.value.byteLength;
    }
    consumed = true;
    let payload: unknown;
    try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, total))); }
    catch (error) {
      if (error instanceof SyntaxError || (error instanceof TypeError && "code" in error &&
          error.code === "ERR_ENCODING_INVALID_ENCODED_DATA")) throw new BeaTransportError("invalid-json");
      throw error;
    }
    return parseBeaEnvelopeV1(payload, request);
  } catch (error) {
    if (error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name)) throw new BeaTransportError("aborted");
    if (error instanceof TypeError && error.message === "fetch failed" && "cause" in error &&
        error.cause instanceof Error && !(error.cause instanceof TypeError || error.cause instanceof ReferenceError)) {
      if (error.cause.message === "unexpected redirect") throw new BeaTransportError("redirect");
      if ("code" in error.cause && ["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT",
        "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET", "ERR_TLS_CERT_ALTNAME_INVALID", "CERT_HAS_EXPIRED",
        "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "DEPTH_ZERO_SELF_SIGNED_CERT"].includes(String(error.cause.code))) {
        throw new BeaTransportError("network");
      }
    }
    if (error instanceof TypeError && error.message === "terminated" && "cause" in error &&
        error.cause instanceof Error && !(error.cause instanceof TypeError || error.cause instanceof ReferenceError) && "code" in error.cause &&
        ["UND_ERR_SOCKET", "UND_ERR_BODY_TIMEOUT", "ECONNRESET"].includes(String(error.cause.code))) throw new BeaTransportError("network");
    // Expected injected transport failures use BeaTransportError. Programming defects propagate.
    throw error;
  } finally {
    if (!consumed) {
      // Cancellation cleanup must not outlive the caller's deadline.
      try {
        const cleanup = reader !== undefined ? reader.cancel() : response?.body?.cancel();
        void cleanup?.catch(() => {});
      } catch { /* Preserve original failure. */ }
    }
    try { reader?.releaseLock(); } catch { /* Preserve original failure. */ }
  }
}

async function cancellable<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new BeaTransportError("aborted");
  let abort: () => void = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(new BeaTransportError("aborted"));
    signal.addEventListener("abort", abort, { once: true });
  });
  try { return await Promise.race([operation(), cancelled]); }
  finally { signal.removeEventListener("abort", abort); }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
