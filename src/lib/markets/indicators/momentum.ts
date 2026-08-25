/**
 * Chronoverse Capital
 * Momentum Engine
 *
 * Pure calculation layer.
 * No provider dependencies.
 */

export type MomentumValue = number | null;

export type MomentumResult = {
  momentum: MomentumValue[];
  roc: MomentumValue[];
};

/**
 * Calculates price momentum and Rate of Change (ROC).
 *
 * Momentum:
 * currentPrice - priceNPeriodsAgo
 *
 * ROC:
 * ((currentPrice - priceNPeriodsAgo) / priceNPeriodsAgo) * 100
 *
 * @param values Array of price values.
 * @param period Lookback period. Default = 10.
 * @returns Arrays aligned 1:1 with the input values.
 */
export function calculateMomentum(
  values: readonly number[],
  period = 10,
): MomentumResult {
  if (!Number.isInteger(period) || period <= 0) {
    throw new Error("Momentum period must be a positive integer.");
  }

  if (values.length === 0) {
    return {
      momentum: [],
      roc: [],
    };
  }

  for (let i = 0; i < values.length; i += 1) {
    if (!Number.isFinite(values[i])) {
      throw new Error(`Invalid momentum value at index ${i}.`);
    }
  }

  const momentum: MomentumValue[] = new Array(values.length).fill(null);
  const roc: MomentumValue[] = new Array(values.length).fill(null);

  if (values.length <= period) {
    return {
      momentum,
      roc,
    };
  }

  for (let i = period; i < values.length; i += 1) {
    const currentValue = values[i];
    const previousValue = values[i - period];

    const momentumValue = currentValue - previousValue;

    momentum[i] = momentumValue;

    if (previousValue === 0) {
      roc[i] = null;
      continue;
    }

    roc[i] = (momentumValue / previousValue) * 100;
  }

  return {
    momentum,
    roc,
  };
}