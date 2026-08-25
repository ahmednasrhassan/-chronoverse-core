/**
 * Chronoverse Capital
 * Exponential Moving Average (EMA) Engine
 *
 * Pure calculation layer.
 * No market-data provider dependencies.
 */

export type EMAValue = number | null;

/**
 * Calculates an Exponential Moving Average.
 *
 * @param values Array of price values.
 * @param period EMA period (example: 20, 50, 200).
 * @returns Array aligned 1:1 with the input values.
 */
export function calculateEMA(
  values: readonly number[],
  period: number,
): EMAValue[] {
  if (!Number.isInteger(period) || period <= 0) {
    throw new Error("EMA period must be a positive integer.");
  }

  if (values.length === 0) {
    return [];
  }

  const result: EMAValue[] = new Array(values.length).fill(null);

  if (values.length < period) {
    return result;
  }

  const multiplier = 2 / (period + 1);

  let seedSum = 0;

  for (let i = 0; i < period; i += 1) {
    const value = values[i];

    if (!Number.isFinite(value)) {
      throw new Error(`Invalid EMA value at index ${i}.`);
    }

    seedSum += value;
  }

  let previousEMA = seedSum / period;

  result[period - 1] = previousEMA;

  for (let i = period; i < values.length; i += 1) {
    const value = values[i];

    if (!Number.isFinite(value)) {
      throw new Error(`Invalid EMA value at index ${i}.`);
    }

    const currentEMA =
      (value - previousEMA) * multiplier + previousEMA;

    result[i] = currentEMA;
    previousEMA = currentEMA;
  }

  return result;
}