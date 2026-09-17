import "server-only";

import { siteConfig } from "../../config/siteConfig";
import { buildCanonicalUrl } from "../seo/site-url";
import {
  resolveLemonCheckoutCustomDataV1,
  type LemonCheckoutCustomDataV1,
} from "./commercialIdentity";
import {
  getVipCommercialConfigV1,
  type VipCommercialConfigV1,
} from "./vipCommercialConfig";
import {
  LEMON_API_TIMEOUT_MS_V1,
  LemonApiRequestErrorV1,
  requestLemonApiJsonV1,
} from "./lemonApi";

const LEMON_CHECKOUT_API_PATH_V1 = "/v1/checkouts";
export const LEMON_CHECKOUT_TIMEOUT_MS_V1 = LEMON_API_TIMEOUT_MS_V1;

export const LEMON_CHECKOUT_PLANS_V1 = ["monthly", "annual"] as const;
export type LemonCheckoutPlanV1 =
  (typeof LEMON_CHECKOUT_PLANS_V1)[number];

export type LemonCheckoutErrorCodeV1 =
  | "configuration-unavailable"
  | "provider-unavailable"
  | "invalid-provider-response";

export class LemonCheckoutErrorV1 extends Error {
  readonly code: LemonCheckoutErrorCodeV1;

  constructor(code: LemonCheckoutErrorCodeV1) {
    super("Hosted checkout is currently unavailable.");
    this.name = "LemonCheckoutErrorV1";
    this.code = code;
  }
}

export interface LemonCheckoutDependenciesV1 {
  readonly resolveCustomData: () => Promise<LemonCheckoutCustomDataV1>;
  readonly getCommercialConfig: () => VipCommercialConfigV1;
  readonly getApiKey: () => string | null | undefined;
  readonly fetchProvider: typeof fetch;
  readonly getReturnUrl: () => string;
  readonly timeoutMs: number;
}

const PRODUCTION_DEPENDENCIES_V1: LemonCheckoutDependenciesV1 = Object.freeze({
  resolveCustomData: resolveLemonCheckoutCustomDataV1,
  getCommercialConfig: getVipCommercialConfigV1,
  getApiKey: () => process.env.LEMON_SQUEEZY_API_KEY,
  fetchProvider: fetch,
  getReturnUrl: () => buildCanonicalUrl("/account"),
  timeoutMs: LEMON_CHECKOUT_TIMEOUT_MS_V1,
});

/** Creates one provider-hosted checkout without granting local access. */
export async function createLemonCheckoutV1(
  plan: LemonCheckoutPlanV1,
  dependencies: LemonCheckoutDependenciesV1 = PRODUCTION_DEPENDENCIES_V1,
): Promise<string> {
  const customData = await dependencies.resolveCustomData();
  const config = getCoherentConfigV1(dependencies);
  const apiKey = getApiKeyV1(dependencies);
  const variantId = plan === "monthly"
    ? config.monthlyVariantId
    : config.annualVariantId;
  const returnUrl = dependencies.getReturnUrl();
  let payload: unknown;

  try {
    payload = await requestLemonApiJsonV1(LEMON_CHECKOUT_API_PATH_V1, {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            product_options: {
              redirect_url: returnUrl,
              enabled_variants: [Number(variantId)],
            },
            checkout_data: {
              custom: customData,
            },
            test_mode: false,
          },
          relationships: {
            store: {
              data: { type: "stores", id: config.storeId },
            },
            variant: {
              data: { type: "variants", id: variantId },
            },
          },
        },
      }),
    }, {
      getApiKey: () => apiKey,
      fetchProvider: dependencies.fetchProvider,
      timeoutMs: dependencies.timeoutMs,
    });
  } catch (error) {
    if (error instanceof LemonApiRequestErrorV1) {
      throw new LemonCheckoutErrorV1(error.code);
    }

    throw new LemonCheckoutErrorV1("provider-unavailable");
  }

  const checkoutUrl = parseCheckoutResponseV1(
    payload,
    config.storeId,
    variantId,
  );

  if (checkoutUrl === null) {
    throw new LemonCheckoutErrorV1("invalid-provider-response");
  }

  return checkoutUrl;
}

export function parseLemonCheckoutRequestV1(
  value: unknown,
): LemonCheckoutPlanV1 | null {
  if (!isRecord(value) || Object.keys(value).length !== 1) {
    return null;
  }

  return value.plan === "monthly" || value.plan === "annual"
    ? value.plan
    : null;
}

function getCoherentConfigV1(
  dependencies: LemonCheckoutDependenciesV1,
): VipCommercialConfigV1 {
  try {
    return dependencies.getCommercialConfig();
  } catch {
    throw new LemonCheckoutErrorV1("configuration-unavailable");
  }
}

function getApiKeyV1(dependencies: LemonCheckoutDependenciesV1): string {
  let apiKey: string | null | undefined;

  try {
    apiKey = dependencies.getApiKey();
  } catch {
    throw new LemonCheckoutErrorV1("configuration-unavailable");
  }

  if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
    throw new LemonCheckoutErrorV1("configuration-unavailable");
  }

  return apiKey.trim();
}

function parseCheckoutResponseV1(
  value: unknown,
  expectedStoreId: string,
  expectedVariantId: string,
): string | null {
  if (!isRecord(value) || !isRecord(value.data)) {
    return null;
  }

  const data = value.data;

  if (data.type !== "checkouts" || !isRecord(data.attributes)) {
    return null;
  }

  const attributes = data.attributes;

  if (
    vendorIdV1(attributes.store_id) !== expectedStoreId
    || vendorIdV1(attributes.variant_id) !== expectedVariantId
    || attributes.test_mode !== false
    || typeof attributes.url !== "string"
  ) {
    return null;
  }

  return safeLemonCheckoutUrlV1(attributes.url);
}

function safeLemonCheckoutUrlV1(value: string): string | null {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const isTrustedCheckoutHost =
      hostname.endsWith(".lemonsqueezy.com")
      || hostname === siteConfig.commerce.lemonStoreHost;

    if (
      url.protocol !== "https:"
      || url.username.length > 0
      || url.password.length > 0
      || (url.port.length > 0 && url.port !== "443")
      || !isTrustedCheckoutHost
      || !url.pathname.startsWith("/checkout/")
      || url.hash.length > 0
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
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
