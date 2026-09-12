import "server-only";

export type VipCommercialConfigurationErrorReasonV1 =
  | "missing-or-malformed"
  | "duplicate-variant-id";

export class VipCommercialConfigurationErrorV1 extends Error {
  readonly variableName: string;
  readonly reason: VipCommercialConfigurationErrorReasonV1;

  constructor(
    variableName: string,
    reason: VipCommercialConfigurationErrorReasonV1,
  ) {
    super(`Invalid required VIP commercial configuration: ${variableName}.`);
    this.name = "VipCommercialConfigurationErrorV1";
    this.variableName = variableName;
    this.reason = reason;
  }
}

export interface VipCommercialConfigV1 {
  readonly storeId: string;
  readonly productId: string;
  readonly monthlyVariantId: string;
  readonly annualVariantId: string;
  readonly variantIds: readonly [string, string];
}

interface VipCommercialEnvironmentV1 {
  readonly LEMON_SQUEEZY_STORE_ID?: string;
  readonly LEMON_SQUEEZY_VIP_PRODUCT_ID?: string;
  readonly LEMON_SQUEEZY_VIP_MONTHLY_VARIANT_ID?: string;
  readonly LEMON_SQUEEZY_VIP_ANNUAL_VARIANT_ID?: string;
}

/** Resolves only server-side identifiers and rejects every ambiguous value. */
export function getVipCommercialConfigV1(
  environment?: VipCommercialEnvironmentV1,
): VipCommercialConfigV1 {
  const source = environment ?? {
    LEMON_SQUEEZY_STORE_ID: process.env.LEMON_SQUEEZY_STORE_ID,
    LEMON_SQUEEZY_VIP_PRODUCT_ID:
      process.env.LEMON_SQUEEZY_VIP_PRODUCT_ID,
    LEMON_SQUEEZY_VIP_MONTHLY_VARIANT_ID:
      process.env.LEMON_SQUEEZY_VIP_MONTHLY_VARIANT_ID,
    LEMON_SQUEEZY_VIP_ANNUAL_VARIANT_ID:
      process.env.LEMON_SQUEEZY_VIP_ANNUAL_VARIANT_ID,
  };
  const storeId = canonicalIdV1(
    "LEMON_SQUEEZY_STORE_ID",
    source.LEMON_SQUEEZY_STORE_ID,
  );
  const productId = canonicalIdV1(
    "LEMON_SQUEEZY_VIP_PRODUCT_ID",
    source.LEMON_SQUEEZY_VIP_PRODUCT_ID,
  );
  const monthlyVariantId = canonicalIdV1(
    "LEMON_SQUEEZY_VIP_MONTHLY_VARIANT_ID",
    source.LEMON_SQUEEZY_VIP_MONTHLY_VARIANT_ID,
  );
  const annualVariantId = canonicalIdV1(
    "LEMON_SQUEEZY_VIP_ANNUAL_VARIANT_ID",
    source.LEMON_SQUEEZY_VIP_ANNUAL_VARIANT_ID,
  );

  if (monthlyVariantId === annualVariantId) {
    throw new VipCommercialConfigurationErrorV1(
      "LEMON_SQUEEZY_VIP_ANNUAL_VARIANT_ID",
      "duplicate-variant-id",
    );
  }

  return Object.freeze({
    storeId,
    productId,
    monthlyVariantId,
    annualVariantId,
    variantIds: Object.freeze([monthlyVariantId, annualVariantId] as const),
  });
}

function canonicalIdV1(variableName: string, value: string | undefined): string {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) {
    throw new VipCommercialConfigurationErrorV1(
      variableName,
      "missing-or-malformed",
    );
  }

  return value;
}
