import {
  getGoldMacroSnapshot,
  type GoldMacroSnapshot,
} from "../../assets/gold/macro";

import {
  createFredProvider,
} from "../../providers/fred/register";

/**
 * Chronoverse Capital
 * Gold Macro / FRED Smoke Test
 *
 * Development validation only.
 *
 * Verifies that FRED can supply
 * the macro inputs required by Gold.
 */

export async function runGoldMacroSmokeTest():
  Promise<GoldMacroSnapshot> {
  const provider =
    createFredProvider();

  if (!provider.isConfigured()) {
    throw new Error(
      "[Chronoverse Macro Test] FRED_API_KEY is not configured.",
    );
  }

  const result =
    await getGoldMacroSnapshot(
      provider,
    );

  validateGoldMacroSnapshot(result);

  return result;
}

function validateGoldMacroSnapshot(
  result: GoldMacroSnapshot,
): void {
  validateObservation(
    "10Y Real Yield",
    result.realYield10Y,
  );

  validateObservation(
    "10Y Nominal Yield",
    result.nominalYield10Y,
  );

  validateObservation(
    "Dollar Index Proxy",
    result.dollarIndexProxy,
  );

  validateObservation(
    "10Y Inflation Expectation",
    result.inflationExpectation10Y,
  );
}

function validateObservation(
  name: string,
  observation: {
    date: string;
    value: number | null;
  } | null,
): void {
  if (observation === null) {
    throw new Error(
      `${name}: no observation returned.`,
    );
  }

  if (!observation.date) {
    throw new Error(
      `${name}: missing observation date.`,
    );
  }

  if (
    observation.value !== null &&
    !Number.isFinite(
      observation.value,
    )
  ) {
    throw new Error(
      `${name}: invalid numeric value.`,
    );
  }
}
