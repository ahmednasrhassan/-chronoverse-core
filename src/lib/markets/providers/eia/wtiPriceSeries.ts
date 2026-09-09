import {
  normalizeCanonicalObservationSeriesV1,
  type CanonicalObservationSeriesV1,
} from "../../services/canonicalObservationSeries";
import { eiaClient } from "./client";
import type {
  EiaSeriesRequest,
  EiaSeriesResult,
} from "./types";

export const EIA_WTI_SPOT_SERIES = Object.freeze({
  route: "petroleum/pri/spt",
  valueField: "value",
  frequency: "daily",
  facet: "RWTC",
  seriesId: "PET.RWTC.D",
  requestedProductId: "RWTC",
  canonicalProductId: "oil",
  unit: "USD/barrel",
  historyLength: 600,
} as const);

export interface EiaWtiPriceSeriesDependenciesV1 {
  readonly loadSeries?: (
    request: EiaSeriesRequest,
  ) => Promise<EiaSeriesResult>;
  readonly now?: () => Date;
}

/** Loads and normalizes EIA's official daily Cushing WTI spot-price series. */
export async function loadEiaWtiPriceSeriesV1(
  dependencies: EiaWtiPriceSeriesDependenciesV1 = {},
): Promise<CanonicalObservationSeriesV1> {
  const loadSeries = dependencies.loadSeries ?? ((request) =>
    eiaClient.getSeries(request));
  const result = await loadSeries({
    route: EIA_WTI_SPOT_SERIES.route,
    valueField: EIA_WTI_SPOT_SERIES.valueField,
    frequency: EIA_WTI_SPOT_SERIES.frequency,
    facets: {
      series: [EIA_WTI_SPOT_SERIES.facet],
    },
    length: EIA_WTI_SPOT_SERIES.historyLength,
    unit: EIA_WTI_SPOT_SERIES.unit,
  });

  if (
    result.provider !== "eia" ||
    result.frequency !== EIA_WTI_SPOT_SERIES.frequency
  ) {
    throw new TypeError("EIA WTI series response identity is invalid.");
  }

  const observations = result.points.flatMap((point) => {
    const timestamp = parseEiaDailyPeriod(point.period);

    return timestamp === null || !Number.isFinite(point.value)
      ? []
      : [{ timestamp, value: point.value }];
  });
  const sourceTimestamp = observations.reduce<number | undefined>(
    (latest, observation) => latest === undefined
      ? observation.timestamp
      : Math.max(latest, observation.timestamp),
    undefined,
  );
  const fetchedAt = Math.floor(
    (dependencies.now ?? (() => new Date()))().getTime() / 1000,
  );

  return normalizeCanonicalObservationSeriesV1({
    observations,
    metadata: {
      provider: "eia",
      source: "U.S. Energy Information Administration",
      seriesId: EIA_WTI_SPOT_SERIES.seriesId,
      requestedProductId: EIA_WTI_SPOT_SERIES.requestedProductId,
      canonicalProductId: EIA_WTI_SPOT_SERIES.canonicalProductId,
      interval: "1d",
      fetchedAt,
      ...(sourceTimestamp === undefined ? {} : { sourceTimestamp }),
      status: "end_of_day",
      unit: EIA_WTI_SPOT_SERIES.unit,
      seriesKind: "spot-price",
    },
  });
}

function parseEiaDailyPeriod(period: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(period);

  if (match === null) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day) / 1000;
  const date = new Date(timestamp * 1000);

  return date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ? timestamp
    : null;
}
