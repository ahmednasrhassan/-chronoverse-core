import type {
  EcbFxReferenceDataResultV1,
  EcbFxReferenceRawObservationV1,
} from "./types";

const ECB_DATA_API_BASE_URL =
  "https://data-api.ecb.europa.eu/service/data/EXR";
const ECB_FX_REFERENCE_QUERY_KEY =
  "D.USD+JPY+GBP+CHF.EUR.SP00.A";
const ECB_CSV_MIME = "text/csv";
const DEFAULT_TIMEOUT_MS = 10_000;

export const ECB_FX_REFERENCE_HISTORY_LENGTH_V1 = 600;
export const ECB_FX_REFERENCE_DATA_URL_V1 =
  `${ECB_DATA_API_BASE_URL}/${ECB_FX_REFERENCE_QUERY_KEY}` +
  `?format=csvdata&detail=dataonly&lastNObservations=${ECB_FX_REFERENCE_HISTORY_LENGTH_V1}`;

export interface EcbClientDependenciesV1 {
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

export class EcbClientV1 {
  readonly #fetchImpl: typeof fetch;
  readonly #timeoutMs: number;

  constructor(dependencies: EcbClientDependenciesV1 = {}) {
    this.#fetchImpl = dependencies.fetchImpl ?? fetch;
    this.#timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (!Number.isInteger(this.#timeoutMs) || this.#timeoutMs <= 0) {
      throw new TypeError("ECB request timeout must be a positive integer.");
    }
  }

  async getFxReferenceRates(
    requestedSeriesIds: readonly string[],
  ): Promise<EcbFxReferenceDataResultV1> {
    if (typeof window !== "undefined") {
      throw new Error("[Chronoverse ECB] Provider access is server-only.");
    }

    const expectedSeriesIds = normalizeRequestedSeriesIds(requestedSeriesIds);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);

    try {
      const response = await this.#fetchImpl(ECB_FX_REFERENCE_DATA_URL_V1, {
        method: "GET",
        headers: {
          Accept: ECB_CSV_MIME,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `[Chronoverse ECB] Request failed with HTTP ${response.status}.`,
        );
      }

      const contentType = response.headers.get("content-type")?.toLowerCase();

      if (contentType === undefined || !contentType.includes("csv")) {
        throw new TypeError("[Chronoverse ECB] Response content type is invalid.");
      }

      const observations = parseFxReferenceCsv(
        await response.text(),
        new Set(expectedSeriesIds),
      );

      return Object.freeze({
        provider: "ecb" as const,
        requestedSeriesIds: Object.freeze(expectedSeriesIds),
        observations,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function normalizeRequestedSeriesIds(
  seriesIds: readonly string[],
): string[] {
  if (seriesIds.length === 0) {
    throw new TypeError("ECB FX reference request requires series IDs.");
  }

  const normalized = seriesIds.map((seriesId) => seriesId.trim());

  if (
    normalized.some((seriesId) => seriesId.length === 0) ||
    new Set(normalized).size !== normalized.length
  ) {
    throw new TypeError("ECB FX reference request series IDs are invalid.");
  }

  return normalized;
}

function parseFxReferenceCsv(
  payload: string,
  expectedSeriesIds: ReadonlySet<string>,
): readonly EcbFxReferenceRawObservationV1[] {
  const records = parseCsv(payload);

  if (records.length < 2) {
    throw new TypeError("[Chronoverse ECB] CSV response contains no data.");
  }

  const headers = records[0]!.map((header, index) =>
    (index === 0 ? header.replace(/^\uFEFF/, "") : header).trim());
  const keyIndex = requireUniqueHeader(headers, "KEY");
  const periodIndex = requireUniqueHeader(headers, "TIME_PERIOD");
  const valueIndex = requireUniqueHeader(headers, "OBS_VALUE");
  const observations: EcbFxReferenceRawObservationV1[] = [];

  for (const record of records.slice(1)) {
    if (record.every((value) => value.length === 0)) {
      continue;
    }

    if (record.length !== headers.length) {
      throw new TypeError("[Chronoverse ECB] CSV row shape is invalid.");
    }

    const seriesId = record[keyIndex]!.trim();

    if (!expectedSeriesIds.has(seriesId)) {
      throw new TypeError("[Chronoverse ECB] CSV series identity is invalid.");
    }

    observations.push(Object.freeze({
      seriesId,
      period: record[periodIndex]!.trim(),
      value: record[valueIndex]!.trim(),
    }));
  }

  return Object.freeze(observations);
}

function requireUniqueHeader(headers: readonly string[], name: string): number {
  const matches = headers.flatMap((header, index) =>
    header === name ? [index] : []);

  if (matches.length !== 1) {
    throw new TypeError(`[Chronoverse ECB] CSV ${name} header is invalid.`);
  }

  return matches[0]!;
}

function parseCsv(payload: string): readonly (readonly string[])[] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < payload.length; index += 1) {
    const character = payload[index]!;

    if (quoted) {
      if (character === "\"") {
        if (payload[index + 1] === "\"") {
          field += "\"";
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }

      continue;
    }

    if (character === "\"") {
      if (field.length !== 0) {
        throw new TypeError("[Chronoverse ECB] CSV quoting is invalid.");
      }

      quoted = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n") {
      record.push(field.replace(/\r$/, ""));
      records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) {
    throw new TypeError("[Chronoverse ECB] CSV quote is unterminated.");
  }

  if (field.length > 0 || record.length > 0) {
    record.push(field.replace(/\r$/, ""));
    records.push(record);
  }

  return Object.freeze(records.map((item) => Object.freeze(item)));
}

export const ecbClientV1 = new EcbClientV1();
