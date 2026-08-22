/**
 * Chronoverse Premium Market Bootstrap
 *
 * Resolves premium market-data configuration and returns
 * the active provider instance when premium markets are enabled.
 *
 * This file must remain vendor-agnostic.
 */

import type { PremiumMarketDataProvider } from "./provider";

import {
  getPremiumMarketConfig,
  validatePremiumMarketConfig,
} from "./config";

import {
  createPremiumProvider,
  hasPremiumProvider,
  setActivePremiumProvider,
} from "./registry";

/**
 * Resolve the active premium market-data provider.
 *
 * Returns null when premium markets are disabled.
 *
 * Throws when premium markets are enabled but configuration
 * or provider registration is invalid.
 */
export function bootstrapPremiumMarketProvider():
  | PremiumMarketDataProvider
  | null {
  const config = getPremiumMarketConfig();

  if (!config.enabled) {
    return null;
  }

  validatePremiumMarketConfig(config);

  if (!config.providerId) {
    throw new Error(
      "[Chronoverse Markets] Premium provider ID is missing."
    );
  }

  if (!hasPremiumProvider(config.providerId)) {
    throw new Error(
      `[Chronoverse Markets] Premium provider "${config.providerId}" is not registered.`
    );
  }

  setActivePremiumProvider(config.providerId);

  const provider = createPremiumProvider(config.providerId);

  if (!provider.isConfigured()) {
    throw new Error(
      `[Chronoverse Markets] Premium provider "${config.providerId}" is registered but not configured.`
    );
  }

  return provider;
}

/**
 * Convenience helper for server-side services that want
 * to know whether a usable premium provider is available.
 */
export function hasUsablePremiumMarketProvider(): boolean {
  try {
    return bootstrapPremiumMarketProvider() !== null;
  } catch {
    return false;
  }
}