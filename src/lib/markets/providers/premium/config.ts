/**
 * Chronoverse Premium Market Data Configuration
 *
 * Centralized server-side configuration for premium
 * market-data infrastructure.
 *
 * IMPORTANT:
 * API secrets must never be exposed through NEXT_PUBLIC_* variables.
 */

export interface PremiumMarketConfig {
  enabled: boolean;
  providerId: string | null;
  apiKey: string | null;
  websocketUrl: string | null;
  restBaseUrl: string | null;
  requestTimeoutMs: number;
}

/**
 * Convert common environment-variable values into booleans.
 */
function parseBoolean(
  value: string | undefined,
  fallback = false
): boolean {
  if (value === undefined) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(
    value.trim().toLowerCase()
  );
}

/**
 * Parse a positive integer safely.
 */
function parsePositiveInteger(
  value: string | undefined,
  fallback: number
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

/**
 * Normalize optional environment values.
 */
function optionalValue(
  value: string | undefined
): string | null {
  const normalized = value?.trim();

  return normalized ? normalized : null;
}

/**
 * Read Chronoverse premium market configuration.
 *
 * Nothing here connects to a vendor.
 * It only prepares the infrastructure for a future
 * premium market-data subscription.
 */
export function getPremiumMarketConfig(): PremiumMarketConfig {
  return {
    enabled: parseBoolean(
      process.env.CHRONOVERSE_PREMIUM_MARKETS_ENABLED,
      false
    ),

    providerId: optionalValue(
      process.env.CHRONOVERSE_PREMIUM_MARKET_PROVIDER
    )?.toLowerCase() ?? null,

    apiKey: optionalValue(
      process.env.CHRONOVERSE_PREMIUM_MARKET_API_KEY
    ),

    websocketUrl: optionalValue(
      process.env.CHRONOVERSE_PREMIUM_MARKET_WS_URL
    ),

    restBaseUrl: optionalValue(
      process.env.CHRONOVERSE_PREMIUM_MARKET_REST_URL
    ),

    requestTimeoutMs: parsePositiveInteger(
      process.env.CHRONOVERSE_PREMIUM_MARKET_TIMEOUT_MS,
      10_000
    ),
  };
}

/**
 * Validate configuration only when premium markets
 * are actually enabled.
 */
export function validatePremiumMarketConfig(
  config: PremiumMarketConfig = getPremiumMarketConfig()
): void {
  if (!config.enabled) {
    return;
  }

  if (!config.providerId) {
    throw new Error(
      "[Chronoverse Markets] Premium markets are enabled but no provider is configured."
    );
  }

  if (!config.apiKey) {
    throw new Error(
      "[Chronoverse Markets] Premium markets are enabled but no API key is configured."
    );
  }
}

/**
 * Convenience helper used by server-side market services.
 */
export function isPremiumMarketsEnabled(): boolean {
  return getPremiumMarketConfig().enabled;
}