import { fredClient } from "./client";

import type {
  EconomicSeriesProvider,
  FredObservation,
  FredSeries,
  FredSeriesRequest,
} from "./types";

/**
 * Chronoverse Capital — FRED Provider
 *
 * Converts raw FRED economic observations into
 * normalized Chronoverse macro-economic series.
 *
 * FRED remains an implementation detail.
 * The intelligence layer communicates through
 * EconomicSeriesProvider only.
 */
export class FredProvider
  implements EconomicSeriesProvider
{
  readonly id = "fred";

  isConfigured(): boolean {
    return fredClient.isConfigured();
  }

  async getSeries(
    request: FredSeriesRequest,
  ): Promise<FredSeries> {
    const seriesId =
      request.seriesId.trim();

    if (!seriesId) {
      throw new Error(
        "[Chronoverse Macro] FRED series ID cannot be empty.",
      );
    }

    const response =
      await fredClient.getSeriesObservations({
        ...request,
        seriesId,
      });

    const observations: FredObservation[] =
      response.observations.map(
        (observation) => ({
          date: observation.date,
          value: parseFredValue(
            observation.value,
          ),
        }),
      );

    return {
      id: seriesId,
      observations,
      provider: "fred",
    };
  }

  async getLatestValue(
    seriesId: string,
  ): Promise<FredObservation | null> {
    const normalizedSeriesId =
      seriesId.trim();

    if (!normalizedSeriesId) {
      throw new Error(
        "[Chronoverse Macro] FRED series ID cannot be empty.",
      );
    }

    const series =
      await this.getSeries({
        seriesId: normalizedSeriesId,
      });

    for (
      let index =
        series.observations.length - 1;
      index >= 0;
      index -= 1
    ) {
      const observation =
        series.observations[index];

      if (observation.value !== null) {
        return observation;
      }
    }

    return null;
  }
}

/**
 * FRED represents missing observations using ".".
 *
 * Invalid and non-finite values are normalized
 * to null rather than leaking provider-specific
 * representation into Chronoverse.
 */
function parseFredValue(
  value: string,
): number | null {
  const normalizedValue =
    value.trim();

  if (
    !normalizedValue ||
    normalizedValue === "."
  ) {
    return null;
  }

  const parsed =
    Number(normalizedValue);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

export const fredProvider =
  new FredProvider();