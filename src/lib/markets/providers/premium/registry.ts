import type {
  PremiumMarketDataProvider,
  PremiumProviderFactory,
} from "./provider";

/**
 * Chronoverse Premium Market Data Provider Registry
 *
 * Central registry for premium market-data adapters.
 *
 * The rest of the application must NOT depend directly
 * on a specific vendor. Providers are registered here
 * and resolved by ID.
 */

const providerFactories = new Map<string, PremiumProviderFactory>();

let activeProviderId: string | null = null;

/**
 * Register a premium market-data provider factory.
 */
export function registerPremiumProvider(
  id: string,
  factory: PremiumProviderFactory
): void {
  const normalizedId = normalizeProviderId(id);

  if (!normalizedId) {
    throw new Error(
      "[Chronoverse Markets] Premium provider ID cannot be empty."
    );
  }

  if (providerFactories.has(normalizedId)) {
    throw new Error(
      `[Chronoverse Markets] Premium provider "${normalizedId}" is already registered.`
    );
  }

  providerFactories.set(normalizedId, factory);
}

/**
 * Check whether a provider has been registered.
 */
export function hasPremiumProvider(id: string): boolean {
  return providerFactories.has(normalizeProviderId(id));
}

/**
 * Return all registered provider IDs.
 */
export function getRegisteredPremiumProviders(): string[] {
  return Array.from(providerFactories.keys());
}

/**
 * Select the provider Chronoverse should currently use.
 */
export function setActivePremiumProvider(id: string): void {
  const normalizedId = normalizeProviderId(id);

  if (!providerFactories.has(normalizedId)) {
    throw new Error(
      `[Chronoverse Markets] Cannot activate unregistered provider "${normalizedId}".`
    );
  }

  activeProviderId = normalizedId;
}

/**
 * Return the currently selected provider ID.
 */
export function getActivePremiumProviderId(): string | null {
  return activeProviderId;
}

/**
 * Create a provider instance by ID.
 */
export function createPremiumProvider(
  id: string
): PremiumMarketDataProvider {
  const normalizedId = normalizeProviderId(id);

  const factory = providerFactories.get(normalizedId);

  if (!factory) {
    throw new Error(
      `[Chronoverse Markets] Premium provider "${normalizedId}" is not registered.`
    );
  }

  return factory();
}

/**
 * Create the currently active premium provider.
 */
export function createActivePremiumProvider(): PremiumMarketDataProvider {
  if (!activeProviderId) {
    throw new Error(
      "[Chronoverse Markets] No active premium market-data provider has been configured."
    );
  }

  return createPremiumProvider(activeProviderId);
}

/**
 * Remove a provider from the registry.
 *
 * Mainly useful for testing and controlled reconfiguration.
 */
export function unregisterPremiumProvider(id: string): boolean {
  const normalizedId = normalizeProviderId(id);

  const removed = providerFactories.delete(normalizedId);

  if (activeProviderId === normalizedId) {
    activeProviderId = null;
  }

  return removed;
}

/**
 * Normalize provider identifiers so configuration remains consistent.
 */
function normalizeProviderId(id: string): string {
  return id.trim().toLowerCase();
}