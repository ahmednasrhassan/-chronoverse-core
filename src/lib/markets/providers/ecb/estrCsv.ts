import {
  normalizeEcbCsvHeaders,
  parseEcbCsv,
  requireEcbCsvHeader,
} from "./csv";
import {
  ECB_ESTR_BENCHMARK_ITEM_V1,
  ECB_ESTR_CALCULATION_METHOD_SERIES_ID_V1,
  ECB_ESTR_FULL_CSV_HEADERS_V1,
  ECB_ESTR_PUBLICATION_TYPE_SERIES_ID_V1,
  ECB_ESTR_SERIES_ID_V1,
} from "./estrContract";
import type {
  EcbEstrDataTypeV1,
  EcbEstrRawObservationV1,
} from "./estrTypes";

const SERIES_BY_DATA_TYPE = Object.freeze({
  WT: ECB_ESTR_SERIES_ID_V1,
  RP: ECB_ESTR_PUBLICATION_TYPE_SERIES_ID_V1,
  CM: ECB_ESTR_CALCULATION_METHOD_SERIES_ID_V1,
} satisfies Record<EcbEstrDataTypeV1, string>);

export function parseEcbEstrCsvV1(
  payload: string,
): readonly EcbEstrRawObservationV1[] {
  const records = parseEcbCsv(payload);

  if (records.length < 2) {
    throw new TypeError("[Chronoverse ECB €STR] CSV response contains no data.");
  }

  const headers = normalizeEcbCsvHeaders(records[0]!);

  if (
    ECB_ESTR_FULL_CSV_HEADERS_V1.some((requiredHeader) =>
      !headers.includes(requiredHeader))
  ) {
    throw new TypeError("[Chronoverse ECB €STR] CSV schema is invalid.");
  }

  const indexes = Object.freeze({
    seriesId: requireEcbCsvHeader(headers, "KEY"),
    frequency: requireEcbCsvHeader(headers, "FREQ"),
    benchmarkItem: requireEcbCsvHeader(headers, "BENCHMARK_ITEM"),
    dataType: requireEcbCsvHeader(headers, "DATA_TYPE_EST"),
    period: requireEcbCsvHeader(headers, "TIME_PERIOD"),
    value: requireEcbCsvHeader(headers, "OBS_VALUE"),
    observationStatus: requireEcbCsvHeader(headers, "OBS_STATUS"),
    confidentialityStatus: requireEcbCsvHeader(headers, "CONF_STATUS"),
    unitMeasure: requireEcbCsvHeader(headers, "UNIT_MEASURE"),
    unitMultiplier: requireEcbCsvHeader(headers, "UNIT_MULT"),
  });
  const observations: EcbEstrRawObservationV1[] = [];

  for (const record of records.slice(1)) {
    if (record.every((value) => value.length === 0)) {
      continue;
    }

    if (record.length !== headers.length) {
      throw new TypeError("[Chronoverse ECB €STR] CSV row shape is invalid.");
    }

    const dataType = record[indexes.dataType]!.trim();

    if (!isEcbEstrDataTypeV1(dataType)) {
      throw new TypeError("[Chronoverse ECB €STR] Data type is invalid.");
    }

    const observation = Object.freeze({
      seriesId: record[indexes.seriesId]!.trim(),
      frequency: record[indexes.frequency]!.trim(),
      benchmarkItem: record[indexes.benchmarkItem]!.trim(),
      dataType,
      period: record[indexes.period]!.trim(),
      value: record[indexes.value]!.trim(),
      observationStatus: record[indexes.observationStatus]!.trim(),
      confidentialityStatus: record[indexes.confidentialityStatus]!.trim(),
      unitMeasure: record[indexes.unitMeasure]!.trim(),
      unitMultiplier: record[indexes.unitMultiplier]!.trim(),
    });

    if (observation.seriesId !== SERIES_BY_DATA_TYPE[dataType]) {
      throw new TypeError("[Chronoverse ECB €STR] Series identity is invalid.");
    }

    if (
      observation.frequency !== "B" ||
      observation.benchmarkItem !== ECB_ESTR_BENCHMARK_ITEM_V1
    ) {
      throw new TypeError("[Chronoverse ECB €STR] Series dimensions are invalid.");
    }

    if (
      observation.confidentialityStatus !== "" &&
      observation.confidentialityStatus !== "F"
    ) {
      throw new TypeError("[Chronoverse ECB €STR] Confidentiality status is invalid.");
    }

    if (
      dataType === "WT" &&
      (observation.unitMeasure !== "PC" || observation.unitMultiplier !== "0")
    ) {
      throw new TypeError("[Chronoverse ECB €STR] Headline unit is invalid.");
    }

    if (observation.period === "" || observation.value === "") {
      throw new TypeError("[Chronoverse ECB €STR] Required observation data is missing.");
    }

    observations.push(observation);
  }

  if (observations.length === 0) {
    throw new TypeError("[Chronoverse ECB €STR] CSV response contains no data.");
  }

  return Object.freeze(observations);
}

function isEcbEstrDataTypeV1(value: string): value is EcbEstrDataTypeV1 {
  return value === "WT" || value === "RP" || value === "CM";
}
