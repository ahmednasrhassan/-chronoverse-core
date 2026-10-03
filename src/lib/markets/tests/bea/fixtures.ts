import { BEA_API_URL_V1, parseBeaEnvelopeV1, type BeaRequestV1 } from "../../providers/bea/client";
import { buildBeaCanonicalMacroSeriesV1, getBeaMacroSourceSpecV1, parseBeaMacroSeriesFactsV1, type BeaMacroFamilyV1 } from "../../providers/bea/macroSeries";
import { createBeaMacroSeriesVintageRedisAdapterV1 } from "../../persistence/beaMacroSeriesVintageRedis";
import type { CanonicalStatisticalSeriesVintageRedisDependencies } from "../../persistence/canonicalStatisticalSeriesVintageRedis";

// Synthetic test credential only; never read a real credential or environment variable.
export const fakeUserId = "00000000-0000-0000-0000-000000000000";
export const gdpRequest: BeaRequestV1 = { dataset: "NIPA", tableName: "T10106", frequency: "Q", years: [2025, 2026] };
export const pceRequest: BeaRequestV1 = { dataset: "NIPA", tableName: "T20804", frequency: "M", years: [2025, 2026] };
export function row(family: BeaMacroFamilyV1, period = family === "real-gdp" ? "2025Q1" : "2025M01", value: unknown = "100"): Record<string, unknown> {
  const spec = getBeaMacroSourceSpecV1(family);
  return { TableName: spec.tableName, SeriesCode: spec.seriesCode, LineNumber: spec.lineNumber,
    LineDescription: spec.lineDescription, TimePeriod: period, METRIC_NAME: spec.metricName,
    CL_UNIT: "Level", UNIT_MULT: family === "real-gdp" ? "6" : "0", DataValue: value, NoteRef: spec.tableName };
}
export function envelope(request: BeaRequestV1 = pceRequest) {
  const title = request.tableName === "T10106" ?
    "Table 1.1.6. Real Gross Domestic Product, Chained Dollars [Billions of chained (2017) dollars]" :
    "Table 2.8.4. Price Indexes for Personal Consumption Expenditures by Major Type of Product, Monthly [Index numbers, 2017=100]";
  return { BEAAPI: {
    Request: { RequestParam: Object.entries({ USERID: fakeUserId, METHOD: "GetData", DATASETNAME: "NIPA",
      TABLENAME: request.tableName, FREQUENCY: request.frequency, YEAR: request.years.join(","), RESULTFORMAT: "JSON" })
      .map(([ParameterName, ParameterValue]) => ({ ParameterName, ParameterValue })) },
    Results: { Statistic: "NIPA Table", UTCProductionTime: "irrelevant timing",
      Data: request.tableName === "T10106" ? [row("real-gdp", "2025Q1", "23,456,789")] :
        [row("pce-price-index", "2025M01", "125.123"), row("core-pce-price-index", "2025M01", "124.456")],
      Notes: [{ NoteRef: String(request.tableName), NoteText: `${title} - LastRevised: September 30, 2026` }],
    },
  } };
}
export function response(request: BeaRequestV1 = pceRequest) {
  return parseBeaEnvelopeV1(envelope(request), request);
}
export function canonical(family: BeaMacroFamilyV1, knownAt = 100, value = 1) {
  const request = family === "real-gdp" ? gdpRequest : pceRequest;
  const source = envelope(request);
  source.BEAAPI.Results.Data.find((datum) => datum.SeriesCode === getBeaMacroSourceSpecV1(family).seriesCode)!.DataValue = String(value);
  const facts = parseBeaMacroSeriesFactsV1(family, parseBeaEnvelopeV1(source, request), request);
  return buildBeaCanonicalMacroSeriesV1(family, facts, knownAt);
}
export const sourceUrl = BEA_API_URL_V1;

type Entry = { score: number; member: string };
export function storage() {
  const entries = new Map<string, Entry[]>();
  let writes = 0, reads = 0, race = false;
  const window = (items: Entry[]) => [...items].sort((a, b) => b.score - a.score).slice(0, 2)
    .flatMap((entry) => [entry.member, String(entry.score)]);
  const dependencies: CanonicalStatisticalSeriesVintageRedisDependencies = {
    readHead: async (key) => { reads++; return window(entries.get(key) ?? []); },
    readAsKnownAt: async (key, asOf) => window((entries.get(key) ?? []).filter((entry) => entry.score <= asOf)),
    compareAndAppend: async (key, expected, score, member) => {
      writes++; if (race) return "race";
      const items = entries.get(key) ?? []; const head = [...items].sort((a, b) => b.score - a.score)[0];
      if (expected === null ? head !== undefined : head === undefined || head.score !== expected.score || head.member !== expected.member) return "race";
      if (items.some((entry) => entry.score === score)) return "score-conflict";
      entries.set(key, [...items, { score, member }]); return "written";
    },
  };
  return { entries, dependencies, adapter: createBeaMacroSeriesVintageRedisAdapterV1(dependencies),
    counts: () => ({ reads, writes }), race: () => { race = true; } };
}
