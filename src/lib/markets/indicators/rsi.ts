/**
 * Chronoverse Capital
 * Relative Strength Index (RSI) Engine
 *
 * Pure calculation layer.
 * Uses Wilder's smoothing method.
 * No market-data provider dependencies.
 */

export type RSIValue = number | null;

/**
 * Calculates the Relative Strength Index (RSI).
 *
 * @param values Array of price values.
 * @param period RSI period. Standard default is 14.
 * @returns Array aligned 1:1 with the input values.
 */
export function calculateRSI(
  values: readonly number[],
  period = 14,
): RSIValue[] {
  if (!Number.isInteger(period) || period <= 0) {
    throw new Error("RSI period must be a positive integer.");
  }

  if (values.length === 0) {
    return [];
  }

  const result: RSIValue[] = new Array(values.length).fill(null);

  if (values.length <= period) {
    return result;
  }

  for (let i = 0; i < values.length; i += 1) {
    if (!Number.isFinite(values[i])) {
      throw new Error(`Invalid RSI value at index ${i}.`);
    }
  }

  let gainSum = 0;
  let lossSum = 0;

  for (let i = 1; i <= period; i += 1) {
    const change = values[i] - values[i - 1];

    if (change > 0) {
      gainSum += change;
    } else if (change < 0) {
      lossSum += Math.abs(change);
    }
  }

  let averageGain = gainSum / period;
  let averageLoss = lossSum / period;

  result[period] = calculateRSIValue(
    averageGain,
    averageLoss,
  );

  for (let i = period + 1; i < values.length; i += 1) {
    const change = values[i] - values[i - 1];

    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    averageGain =
      (averageGain * (period - 1) + gain) / period;

    averageLoss =
      (averageLoss * (period - 1) + loss) / period;

    result[i] = calculateRSIValue(
      averageGain,
      averageLoss,
    );
  }

  return result;
}

function calculateRSIValue(
  averageGain: number,
  averageLoss: number,
): number {
  if (averageLoss === 0 && averageGain === 0) {
    return 50;
  }

  if (averageLoss === 0) {
    return 100;
  }

  if (averageGain === 0) {
    return 0;
  }

  const relativeStrength = averageGain / averageLoss;

  return 100 - 100 / (1 + relativeStrength);
}