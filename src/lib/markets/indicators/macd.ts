import { calculateEMA } from "./ema";

export type MACDValue = number | null;

export type MACDResult = {
  macd: MACDValue[];
  signal: MACDValue[];
  histogram: MACDValue[];
};

/**
 * Chronoverse Capital
 * MACD Engine
 *
 * Pure calculation layer.
 * No provider dependencies.
 */
export function calculateMACD(
  values: readonly number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MACDResult {
  if (!Number.isInteger(fastPeriod) || fastPeriod <= 0) {
    throw new Error("MACD fast period must be a positive integer.");
  }

  if (!Number.isInteger(slowPeriod) || slowPeriod <= 0) {
    throw new Error("MACD slow period must be a positive integer.");
  }

  if (!Number.isInteger(signalPeriod) || signalPeriod <= 0) {
    throw new Error("MACD signal period must be a positive integer.");
  }

  if (fastPeriod >= slowPeriod) {
    throw new Error("MACD fast period must be smaller than slow period.");
  }

  if (values.length === 0) {
    return {
      macd: [],
      signal: [],
      histogram: [],
    };
  }

  for (let i = 0; i < values.length; i += 1) {
    if (!Number.isFinite(values[i])) {
      throw new Error(`Invalid MACD value at index ${i}.`);
    }
  }

  const fastEMA = calculateEMA(values, fastPeriod);
  const slowEMA = calculateEMA(values, slowPeriod);

  const macd: MACDValue[] = new Array(values.length).fill(null);

  const compactMacdValues: number[] = [];
  const compactMacdIndexes: number[] = [];

  for (let i = 0; i < values.length; i += 1) {
    const fast = fastEMA[i];
    const slow = slowEMA[i];

    if (fast !== null && slow !== null) {
      const value = fast - slow;

      macd[i] = value;
      compactMacdValues.push(value);
      compactMacdIndexes.push(i);
    }
  }

  const compactSignal = calculateEMA(
    compactMacdValues,
    signalPeriod,
  );

  const signal: MACDValue[] = new Array(values.length).fill(null);
  const histogram: MACDValue[] = new Array(values.length).fill(null);

  for (let i = 0; i < compactSignal.length; i += 1) {
    const signalValue = compactSignal[i];

    if (signalValue === null) {
      continue;
    }

    const originalIndex = compactMacdIndexes[i];
    const macdValue = macd[originalIndex];

    if (macdValue === null) {
      continue;
    }

    signal[originalIndex] = signalValue;
    histogram[originalIndex] = macdValue - signalValue;
  }

  return {
    macd,
    signal,
    histogram,
  };
}