import {
  FredProvider,
  fredProvider,
} from "./provider";

import type {
  EconomicSeriesProvider,
} from "./types";

/**
 * Chronoverse Capital — FRED Registration
 *
 * FRED belongs to the macro-economic data layer,
 * not the premium OHLCV market-data registry.
 */

let registered = false;

let activeProvider:
  EconomicSeriesProvider | null = null;

/**
 * Register FRED as the Chronoverse
 * economic-series provider.
 *
 * Safe to call more than once.
 * Performs no network request.
 */
export function registerFredProvider(): void {
  if (registered) {
    return;
  }

  activeProvider = fredProvider;
  registered = true;
}

/**
 * Check whether FRED has been registered.
 */
export function isFredProviderRegistered(): boolean {
  return registered;
}

/**
 * Return the active economic-series provider.
 */
export function getEconomicSeriesProvider():
  EconomicSeriesProvider {
  if (!activeProvider) {
    throw new Error(
      "[Chronoverse Macro] No economic-series provider has been registered.",
    );
  }

  return activeProvider;
}

/**
 * Create an isolated FRED provider instance.
 *
 * Useful for testing without changing
 * the registered provider.
 */
export function createFredProvider():
  EconomicSeriesProvider {
  return new FredProvider();
}