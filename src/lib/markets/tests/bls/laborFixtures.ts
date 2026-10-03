import { BLS_LABOR_SERIES_IDS_V1, BLS_TIMESERIES_API_URL_V1 } from "../../providers/bls/client";

export const laborRequest = { seriesIds: BLS_LABOR_SERIES_IDS_V1, startYear: 2025, endYear: 2026 };
export const laborDatum = (period = "M01", value: unknown = "1", footnotes: unknown[] = [{}]) =>
  ({ year: "2026", period, periodName: "fixture month", value, footnotes });
export function laborResponse() {
  return { sourceUrl: BLS_TIMESERIES_API_URL_V1, payload: {
    status: "REQUEST_SUCCEEDED", message: [] as string[], responseTime: 1,
    Results: { series: [
      { seriesID: "CES0000000001", data: [laborDatum("M01", "158592")] },
      { seriesID: "LNS14000000", data: [laborDatum("M01", "4.3")] },
      { seriesID: "CES0500000003", data: [laborDatum("M01", "37.15")] },
    ] },
  } };
}
