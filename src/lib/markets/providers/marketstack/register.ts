import {
  hasPremiumProvider,
  registerPremiumProvider,
} from "../premium/registry";

import { MarketstackProvider } from "./provider";

/**
 * Register Marketstack as a Chronoverse premium
 * market-data provider.
 *
 * Safe to call more than once.
 * Registration does not activate the provider
 * and performs no network request.
 */
export function registerMarketstackProvider(): void {
  if (hasPremiumProvider("marketstack")) {
    return;
  }

  registerPremiumProvider(
    "marketstack",
    () => new MarketstackProvider()
  );
}