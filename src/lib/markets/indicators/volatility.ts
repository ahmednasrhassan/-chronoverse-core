/**
 * Chronoverse Capital
 * Volatility Engine
 *
 * Pure calculation layer.
 * No provider dependencies.
 */

export type VolatilityValue = number | null;

export type VolatilityResult = {
  standardDeviation: VolatilityValue[];
  annualizedVolatility: VolatilityValue[];
};

/**
 * Calculates rolling standard deviation and annualized volatility.
 *
 * Annualized volatility is based on log returns.
 *
 * @param values Array of price values.
 * @param period Rolling lookback period. Default = 20.
 * @param annualizationFactor Trading periods per year. Default = 252.
 * @returns Arrays aligned 1:1 with the input values.
 */
export function calculateVolatility(
  values: readonly number[],
  period = 20,
  annualizationFactor = 252,
): VolatilityResult {
  if (!Number.isInteger(period) || period <= 1) {
    throw new Error("Volatility period must be an integer greater than 1.");
  }

  if (
    !Number.isFinite(annualizationFactor) ||
    annualizationFactor <= 0
  ) {
    throw new Error(
      "Annualization factor must be a positive number.",
    );
  }

  if (values.length === 0) {
    return {
      standardDeviation: [],
      annualizedVolatility: [],
    };
  }

  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];

    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(
        `Invalid volatility price value at index ${i}.`,
      );
    }
  }

  const standardDeviation: VolatilityValue[] =
    new Array(values.length).fill(null);

  const annualizedVolatility: VolatilityValue[] =
    new Array(values.length).fill(null);

  if (values.length <= period) {
    return {
      standardDeviation,
      annualizedVolatility,
    };
  }

  const logReturns: VolatilityValue[] =
    new Array(values.length).fill(null);

  for (let i = 1; i < values.length; i += 1) {
    logReturns[i] = Math.log(values[i] / values[i - 1]);
  }

  for (let i = period; i < values.length; i += 1) {
    const returns: number[] = [];

    for (let j = i - period + 1; j <= i; j += 1) {
      const value = logReturns[j];

      if (value !== null) {
        returns.push(value);
      }
    }

    if (returns.length !== period) {
      continue;
    }

    const mean =
      returns.reduce((sum, value) => sum + value, 0) /
      returns.length;

    const variance =
      returns.reduce((sum, value) => {
        const difference = value - mean;
        return sum + difference * difference;
      }, 0) /
      (returns.length - 1);

    const deviation = Math.sqrt(variance);

    standardDeviation[i] = deviation;

    annualizedVolatility[i] =
      deviation * Math.sqrt(annualizationFactor) * 100;
  }

  return {
    standardDeviation,
    annualizedVolatility,
  };
}