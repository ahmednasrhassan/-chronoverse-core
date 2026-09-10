import type {
  EcbFxReferenceDataResultV1,
  EcbFxReferenceRawObservationV1,
} from "./types";
import {
  normalizeEcbCsvHeaders,
  parseEcbCsv,
  requireEcbCsvHeader,
} from "./csv";
import {
  ECB_ESTR_BOOTSTRAP_DATA_URL_V1,
  ECB_ESTR_PRODUCTION_DATA_URL_V1,
} from "./estrContract";
import { parseEcbEstrCsvV1 } from "./estrCsv";
import type { EcbEstrDataResultV1 } from "./estrTypes";

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
    const expectedSeriesIds = normalizeRequestedSeriesIds(requestedSeriesIds);
    const observations = parseFxReferenceCsv(
      await this.#getCsv(ECB_FX_REFERENCE_DATA_URL_V1),
      new Set(expectedSeriesIds),
    );

    return Object.freeze({
      provider: "ecb" as const,
      requestedSeriesIds: Object.freeze(expectedSeriesIds),
      observations,
    });
  }

  async getEstrReferenceRate(): Promise<EcbEstrDataResultV1> {
    return this.#getEstr(ECB_ESTR_PRODUCTION_DATA_URL_V1);
  }

  async getEstrReferenceRateHistory(): Promise<EcbEstrDataResultV1> {
    return this.#getEstr(ECB_ESTR_BOOTSTRAP_DATA_URL_V1);
  }

  async #getEstr(url: string): Promise<EcbEstrDataResultV1> {
    return Object.freeze({
      provider: "ecb" as const,
      observations: parseEcbEstrCsvV1(await this.#getCsv(url)),
    });
  }

  async #getCsv(url: string): Promise<string> {
    if (typeof window !== "undefined") {
      throw new Error("[Chronoverse ECB] Provider access is server-only.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);

    try {
      const response = await this.#fetchImpl(url, {
        method: "GET",
        headers: { Accept: ECB_CSV_MIME },
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

      return response.text();
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
  const records = parseEcbCsv(payload);

  if (records.length < 2) {
    throw new TypeError("[Chronoverse ECB] CSV response contains no data.");
  }

  const headers = normalizeEcbCsvHeaders(records[0]!);
  const keyIndex = requireEcbCsvHeader(headers, "KEY");
  const periodIndex = requireEcbCsvHeader(headers, "TIME_PERIOD");
  const valueIndex = requireEcbCsvHeader(headers, "OBS_VALUE");
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

export const ecbClientV1 = new EcbClientV1();
