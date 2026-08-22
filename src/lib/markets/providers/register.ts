/**
 * Chronoverse Market Provider Registration
 *
 * Central registration point for market-data providers.
 *
 * This module registers available provider adapters.
 * It does not activate a provider and performs no
 * network requests.
 */

import { registerMarketstackProvider } from "./marketstack/register";

let providersRegistered = false;

/**
 * Register all market-data providers available
 * to the Chronoverse market infrastructure.
 *
 * Safe to call more than once.
 */
export function registerMarketProviders(): void {
  if (providersRegistered) {
    return;
  }

  registerMarketstackProvider();

  providersRegistered = true;
}