/**
 * Chronoverse Capital — Premium Market Data Provider
 *
 * Provider-agnostic contract for commercial market-data services.
 *
 * This layer intentionally contains no vendor-specific implementation.
 * A future provider can implement this contract without requiring the
 * rest of Chronoverse to know which commercial data vendor is in use.
 */

import type {
  HistoricalDataRequest,
  HistoricalDataResponse,
  MarketDataProvider,
  MarketQuote,
  RealtimeMarketProvider,
  RealtimeMarketUpdate,
} from "../../core/types";

/**
 * Capabilities that may differ between commercial data vendors
 * and subscription plans.
 */
export interface PremiumProviderCapabilities {
  realtime: boolean;
  historical: boolean;
  websocket: boolean;

  stocks: boolean;
  indices: boolean;
  forex: boolean;
  crypto: boolean;
  commodities: boolean;
  fixedIncome: boolean;
}

/**
 * Runtime information describing the commercial provider.
 *
 * This does not contain API keys, secrets, or credentials.
 */
export interface PremiumProviderInfo {
  id: string;
  name: string;

  capabilities: PremiumProviderCapabilities;
}

/**
 * Base contract for a premium Chronoverse market-data provider.
 *
 * Every commercial provider adapter must implement the normalized
 * MarketDataProvider interface defined by the Chronoverse core.
 */
export interface PremiumMarketDataProvider extends MarketDataProvider {
  readonly tier: "premium";
  readonly info: PremiumProviderInfo;

  /**
   * Indicates whether the provider is configured and can be used.
   *
   * This should normally verify configuration/environment state,
   * not perform an expensive network request.
   */
  isConfigured(): boolean;
}

/**
 * Optional real-time extension for premium providers supporting
 * streaming/WebSocket market data.
 */
export interface PremiumRealtimeMarketProvider
  extends PremiumMarketDataProvider,
    RealtimeMarketProvider {}

/**
 * Factory signature used to create a premium provider.
 *
 * Keeping creation behind a factory allows Chronoverse to switch
 * commercial vendors without coupling application code to them.
 */
export type PremiumProviderFactory = () => PremiumMarketDataProvider;

/**
 * Type guard for providers that expose real-time streaming.
 */
export function supportsRealtimeStreaming(
  provider: PremiumMarketDataProvider
): provider is PremiumRealtimeMarketProvider {
  return (
    provider.info.capabilities.realtime === true &&
    provider.info.capabilities.websocket === true &&
    "subscribe" in provider &&
    typeof provider.subscribe === "function"
  );
}

/**
 * Re-export normalized core contracts used by premium adapters.
 *
 * Vendor adapters should map their native responses into these types
 * before returning data to the rest of Chronoverse.
 */
export type {
  HistoricalDataRequest,
  HistoricalDataResponse,
  MarketQuote,
  RealtimeMarketUpdate,
};