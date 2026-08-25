import type {
  EconomicSeriesProvider,
  FredObservation,
} from "../../providers/fred/types";

export type GoldMacroSnapshot = {
  realYield10Y: FredObservation | null;
  nominalYield10Y: FredObservation | null;
  dollarIndexProxy: FredObservation | null;
  inflationExpectation10Y: FredObservation | null;
};

export type GoldMacroSeriesConfig = {
  realYield10Y: string;
  nominalYield10Y: string;
  dollarIndexProxy: string;
  inflationExpectation10Y: string;
};

/**
 * Chronoverse Capital
 * Gold Macro Context
 *
 * This layer knows which economic series matter to gold.
 * The Gold Intelligence Engine does not know or care
 * whether the source is FRED or another provider.
 */
export const GOLD_MACRO_SERIES: GoldMacroSeriesConfig = {
  realYield10Y: "DFII10",
  nominalYield10Y: "DGS10",
  dollarIndexProxy: "DTWEXBGS",
  inflationExpectation10Y: "T10YIE",
};

/**
 * Fetch latest macro observations relevant to gold.
 */
export async function getGoldMacroSnapshot(
  provider: EconomicSeriesProvider,
): Promise<GoldMacroSnapshot> {
  const [
    realYield10Y,
    nominalYield10Y,
    dollarIndexProxy,
    inflationExpectation10Y,
  ] = await Promise.all([
    provider.getLatestValue(
      GOLD_MACRO_SERIES.realYield10Y,
    ),

    provider.getLatestValue(
      GOLD_MACRO_SERIES.nominalYield10Y,
    ),

    provider.getLatestValue(
      GOLD_MACRO_SERIES.dollarIndexProxy,
    ),

    provider.getLatestValue(
      GOLD_MACRO_SERIES.inflationExpectation10Y,
    ),
  ]);

  return {
    realYield10Y,
    nominalYield10Y,
    dollarIndexProxy,
    inflationExpectation10Y,
  };
}