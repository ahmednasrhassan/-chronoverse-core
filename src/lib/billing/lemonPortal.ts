import "server-only";

import {
  requireAuthenticatedV1,
  type AccessGuardsV1,
} from "../auth/guards";
import type { AuthenticatedAccessV1 } from "../auth/types";
import {
  loadPrivateLemonCustomerRowsV1,
  resolveTrustedProductionCustomerV1,
  BillingManagementErrorV1,
} from "./billingManagement";
import {
  LEMON_API_TIMEOUT_MS_V1,
  LemonApiRequestErrorV1,
  requestLemonApiJsonV1,
} from "./lemonApi";
import {
  getVipCommercialConfigV1,
  type VipCommercialConfigV1,
} from "./vipCommercialConfig";

export const LEMON_PORTAL_TIMEOUT_MS_V1 = LEMON_API_TIMEOUT_MS_V1;

export type LemonPortalErrorCodeV1 =
  | "customer-not-found"
  | "customer-mapping-invalid"
  | "configuration-unavailable"
  | "provider-unavailable"
  | "invalid-provider-response";

export class LemonPortalErrorV1 extends Error {
  readonly code: LemonPortalErrorCodeV1;

  constructor(code: LemonPortalErrorCodeV1) {
    super("Subscription management is currently unavailable.");
    this.name = "LemonPortalErrorV1";
    this.code = code;
  }
}

export interface LemonPortalDependenciesV1 {
  readonly requireAuthenticated: AccessGuardsV1["requireAuthenticated"];
  readonly loadCustomerRows: (userId: string) => Promise<unknown>;
  readonly getCommercialConfig: () => VipCommercialConfigV1;
  readonly getApiKey: () => string | null | undefined;
  readonly fetchProvider: typeof fetch;
  readonly timeoutMs: number;
}

const PRODUCTION_DEPENDENCIES_V1: LemonPortalDependenciesV1 = Object.freeze({
  requireAuthenticated: requireAuthenticatedV1,
  loadCustomerRows: loadPrivateLemonCustomerRowsV1,
  getCommercialConfig: getVipCommercialConfigV1,
  getApiKey: () => process.env.LEMON_SQUEEZY_API_KEY,
  fetchProvider: fetch,
  timeoutMs: LEMON_PORTAL_TIMEOUT_MS_V1,
});

/** Retrieves the current provider-issued portal URL for the verified caller. */
export async function createLemonCustomerPortalV1(
  dependencies: LemonPortalDependenciesV1 = PRODUCTION_DEPENDENCIES_V1,
): Promise<string> {
  const access = await dependencies.requireAuthenticated();
  const config = commercialConfigV1(dependencies);
  const customer = await trustedCustomerV1(access, config, dependencies);
  let payload: unknown;

  try {
    payload = await requestLemonApiJsonV1(
      `/v1/customers/${customer.customerId}`,
      { method: "GET" },
      dependencies,
    );
  } catch (error) {
    if (error instanceof LemonApiRequestErrorV1) {
      throw new LemonPortalErrorV1(error.code);
    }

    throw new LemonPortalErrorV1("provider-unavailable");
  }

  const portalUrl = parseLemonCustomerPortalResponseV1(
    payload,
    customer.customerId,
    config.storeId,
  );

  if (portalUrl === null) {
    throw new LemonPortalErrorV1("invalid-provider-response");
  }

  return portalUrl;
}

export function parseLemonCustomerPortalResponseV1(
  value: unknown,
  expectedCustomerId: string,
  expectedStoreId: string,
): string | null {
  if (!isRecord(value) || !isRecord(value.data)) return null;

  const data = value.data;

  if (data.type !== "customers" || data.id !== expectedCustomerId ||
    !isRecord(data.attributes)) {
    return null;
  }

  const attributes = data.attributes;

  if (vendorIdV1(attributes.store_id) !== expectedStoreId ||
    attributes.test_mode !== false || !isRecord(attributes.urls) ||
    typeof attributes.urls.customer_portal !== "string") {
    return null;
  }

  return safeLemonPortalUrlV1(attributes.urls.customer_portal);
}

export function safeLemonPortalUrlV1(value: string): string | null {
  if (value.trim().length === 0) return null;

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    if (url.protocol !== "https:" || url.username.length > 0 ||
      url.password.length > 0 || (url.port.length > 0 && url.port !== "443") ||
      !hostname.endsWith(".lemonsqueezy.com") || url.pathname === "/" ||
      url.hash.length > 0) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

async function trustedCustomerV1(
  access: AuthenticatedAccessV1,
  config: VipCommercialConfigV1,
  dependencies: LemonPortalDependenciesV1,
) {
  let customerRows: unknown;

  try {
    customerRows = await dependencies.loadCustomerRows(access.userId);
    const customer = resolveTrustedProductionCustomerV1(
      customerRows,
      access.userId,
      config.storeId,
    );

    if (customer === null) {
      throw new LemonPortalErrorV1("customer-not-found");
    }

    return customer;
  } catch (error) {
    if (error instanceof LemonPortalErrorV1) throw error;
    if (error instanceof BillingManagementErrorV1) {
      throw new LemonPortalErrorV1("customer-mapping-invalid");
    }

    throw new LemonPortalErrorV1("customer-mapping-invalid");
  }
}

function commercialConfigV1(
  dependencies: LemonPortalDependenciesV1,
): VipCommercialConfigV1 {
  try {
    return dependencies.getCommercialConfig();
  } catch {
    throw new LemonPortalErrorV1("configuration-unavailable");
  }
}

function vendorIdV1(value: unknown): string | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }

  return typeof value === "string" && /^[1-9][0-9]*$/.test(value)
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
