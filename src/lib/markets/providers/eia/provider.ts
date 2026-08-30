import { eiaClient } from "./client";

import type {
  EiaChangeSnapshot,
  EiaOilFundamentalSnapshot,
  EiaSeriesPoint,
} from "./types";

/**
 * Chronoverse Capital
 * EIA Oil Fundamentals Provider
 *
 * Official EIA data used here:
 *
 * Supply:
 * - U.S. Commercial Crude Oil Stocks
 * - U.S. Crude Oil Production
 *
 * Demand:
 * - World Petroleum and Other Liquids Consumption
 *
 * The provider converts official EIA observations
 * into normalized Chronoverse change snapshots.
 *
 * Weekly series use week-over-week changes.
 * Global demand uses annual year-over-year changes.
 */
export class EiaOilFundamentalsProvider {
  readonly id = "eia";

  isConfigured(): boolean {
    return eiaClient.isConfigured();
  }

  async getOilFundamentals():
    Promise<EiaOilFundamentalSnapshot> {
    const [
      inventories,
      production,
      globalDemand,
    ] = await Promise.all([
      this.getInventories(),
      this.getProduction(),
      this.getGlobalDemand(),
    ]);

    return {
      inventories,
      production,
      globalDemand,

      provider: "eia",

      fetchedAt:
        new Date().toISOString(),
    };
  }

  private async getInventories():
    Promise<EiaChangeSnapshot> {
    const result =
      await eiaClient.getSeries({
        route:
          "petroleum/stoc/wstk",

        valueField:
          "value",

        frequency:
          "weekly",

        facets: {
          series: [
            "WCESTUS1",
          ],
        },

        length:
          2,

        unit:
          "thousand barrels",
      });

    return buildChangeSnapshot(
      result.points,
    );
  }

  private async getProduction():
    Promise<EiaChangeSnapshot> {
    const result =
      await eiaClient.getSeries({
        route:
          "petroleum/sum/sndw",

        valueField:
          "value",

        frequency:
          "weekly",

        facets: {
          series: [
            "WCRFPUS2",
          ],
        },

        length:
          2,

        unit:
          "thousand barrels per day",
      });

    return buildChangeSnapshot(
      result.points,
    );
  }

  private async getGlobalDemand():
    Promise<EiaChangeSnapshot> {
    const result =
      await eiaClient.getSeries({
        route:
          "international",

        valueField:
          "value",

        frequency:
          "annual",

        facets: {
          activityId: [
            "2",
          ],

          productId: [
            "5",
          ],

          countryRegionId: [
            "WORL",
          ],

          unit: [
            "TBPD",
          ],
        },

        length:
          2,

        unit:
          "TBPD",
      });

    return buildChangeSnapshot(
      result.points,
    );
  }
}

function buildChangeSnapshot(
  points: readonly EiaSeriesPoint[],
): EiaChangeSnapshot {
  const latest =
    points[0] ?? null;

  const previous =
    points[1] ?? null;

  if (
    !latest ||
    !previous ||
    previous.value === 0
  ) {
    return {
      latest:
        latest?.value ??
        null,

      previous:
        previous?.value ??
        null,

      changePct:
        null,

      period:
        latest?.period ??
        null,
    };
  }

  const changePct =
    ((latest.value -
      previous.value) /
      previous.value) *
    100;

  return {
    latest:
      latest.value,

    previous:
      previous.value,

    changePct,

    period:
      latest.period,
  };
}

export const eiaOilFundamentalsProvider =
  new EiaOilFundamentalsProvider();