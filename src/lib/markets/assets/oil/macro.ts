import {
  calculateCanonicalMacroFeaturesV3,
  type CanonicalMacroDriverInputV3,
  type CanonicalMacroFeaturesSectionV3,
} from "../../engine/macroFeatures";

export type OilMacroDirection =
  | "bullish"
  | "bearish"
  | "neutral";

export type OilMacroInput = {
  /**
   * Percentage change in commercial crude inventories.
   *
   * Rising inventories generally increase bearish pressure.
   * Falling inventories generally increase bullish pressure.
   */
  inventoriesChangePct:
    number | null;

  /**
   * Percentage change in crude production.
   *
   * Rising production generally increases supply pressure.
   */
  productionChangePct:
    number | null;

  /**
   * Percentage change in global oil demand.
   *
   * Rising demand generally supports oil prices.
   */
  globalDemandChangePct:
    number | null;

  /**
   * Percentage change in USD strength.
   *
   * A stronger USD generally creates a headwind
   * for USD-denominated commodities.
   */
  usdChangePct:
    number | null;

  observedAt?: {
    readonly inventories?: string | null;
    readonly production?: string | null;
    readonly globalDemand?: string | null;
    readonly usd?: string | null;
  };
};

export type OilMacroDriverResult = {
  score: number;
  available: boolean;
  reason: string;
};

export type OilMacroResult = {
  score: number;

  direction:
    OilMacroDirection;

  confidence: number;

  coverage: number;

  drivers: {
    inventories:
      OilMacroDriverResult;

    production:
      OilMacroDriverResult;

    globalDemand:
      OilMacroDriverResult;

    usd:
      OilMacroDriverResult;
  };

  reasons: string[];

  canonical: CanonicalMacroFeaturesSectionV3;
};

/*
 * ======================================================
 * OIL MACRO CALIBRATION
 * ======================================================
 *
 * This is an initial Oil-specific macro calibration.
 *
 * It is deliberately isolated from the Universal Core.
 * Technical, signal and risk calculations remain shared.
 *
 * These values can later be calibrated using historical
 * EIA / official macro data without changing the Core.
 */

export const OIL_MACRO_WEIGHTS = {
  inventories: 0.35,
  production: 0.25,
  globalDemand: 0.25,
  usd: 0.15,
} as const;

const OIL_MACRO_THRESHOLDS = {
  inventories: {
    moderate: 1,
    strong: 3,
  },

  production: {
    moderate: 0.5,
    strong: 1.5,
  },

  globalDemand: {
    moderate: 0.5,
    strong: 1.5,
  },

  usd: {
    moderate: 0.5,
    strong: 1.5,
  },
} as const;

/**
 * Chronoverse Capital
 * Oil Macro Intelligence
 *
 * Asset-specific fundamental interpretation layer.
 *
 * Positive score:
 *   Macro environment is supportive for Oil.
 *
 * Negative score:
 *   Macro environment is restrictive for Oil.
 *
 * Score range:
 *   -1 to +1
 */
export function calculateOilMacro(
  input: OilMacroInput,
): OilMacroResult {
  const inventories =
    scoreInverseDriver(
      input.inventoriesChangePct,
      OIL_MACRO_THRESHOLDS
        .inventories.moderate,
      OIL_MACRO_THRESHOLDS
        .inventories.strong,
      "Commercial crude inventories",
    );

  const production =
    scoreInverseDriver(
      input.productionChangePct,
      OIL_MACRO_THRESHOLDS
        .production.moderate,
      OIL_MACRO_THRESHOLDS
        .production.strong,
      "Crude production",
    );

  const globalDemand =
    scoreDirectDriver(
      input.globalDemandChangePct,
      OIL_MACRO_THRESHOLDS
        .globalDemand.moderate,
      OIL_MACRO_THRESHOLDS
        .globalDemand.strong,
      "Global oil demand",
    );

  const usd =
    scoreInverseDriver(
      input.usdChangePct,
      OIL_MACRO_THRESHOLDS
        .usd.moderate,
      OIL_MACRO_THRESHOLDS
        .usd.strong,
      "US dollar",
    );

  const drivers = {
    inventories,
    production,
    globalDemand,
    usd,
  };

  const canonical = calculateCanonicalMacroFeaturesV3({
    availability: "applicable",
    drivers: [
      canonicalDriver(
        "inventories",
        OIL_MACRO_WEIGHTS.inventories,
        inventories,
        input.observedAt?.inventories,
      ),
      canonicalDriver(
        "production",
        OIL_MACRO_WEIGHTS.production,
        production,
        input.observedAt?.production,
      ),
      canonicalDriver(
        "global-demand",
        OIL_MACRO_WEIGHTS.globalDemand,
        globalDemand,
        input.observedAt?.globalDemand,
      ),
      canonicalDriver(
        "usd",
        OIL_MACRO_WEIGHTS.usd,
        usd,
        input.observedAt?.usd,
      ),
    ],
  });

  if (
    canonical.availability !== "available" &&
    canonical.availability !== "partial"
  ) {
    return {
      score: 0,

      direction:
        "neutral",

      confidence: 0,

      coverage: 0,

      drivers,

      reasons: [
        "Insufficient macro data for Oil analysis.",
      ],
      canonical,
    };
  }

  const normalizedScore =
    canonical.data.score;

  const coverage =
    canonical.data.coverage;

  const directionalAgreement =
    Math.abs(
      normalizedScore,
    );

  const confidence =
    clamp(
      coverage *
        (
          0.4 +
          directionalAgreement *
            0.6
        ),
      0,
      1,
    );

  let direction:
    OilMacroDirection =
      "neutral";

  if (
    normalizedScore >= 0.25
  ) {
    direction =
      "bullish";
  } else if (
    normalizedScore <= -0.25
  ) {
    direction =
      "bearish";
  }

  const reasons =
    Object.values(
      drivers,
    )
      .filter(
        (
          driver,
        ) =>
          driver.available,
      )
      .map(
        (
          driver,
        ) =>
          driver.reason,
      );

  return {
    score:
      Number(
        normalizedScore.toFixed(
          4,
        ),
      ),

    direction,

    confidence:
      Number(
        confidence.toFixed(
          4,
        ),
      ),

    coverage:
      Number(
        coverage.toFixed(
          4,
        ),
      ),

    drivers,

    reasons,
    canonical,
  };
}

function canonicalDriver(
  id: string,
  weight: number,
  driver: OilMacroDriverResult,
  observedAt: string | null | undefined,
): CanonicalMacroDriverInputV3 {
  return driver.available
    ? {
        id,
        weight,
        availability: "available",
        score: driver.score,
        ...(observedAt ? { observedAt } : {}),
      }
    : {
        id,
        weight,
        availability: "unavailable",
        reason: driver.reason,
      };
}

/*
 * ======================================================
 * DRIVER SCORING
 * ======================================================
 */

function scoreDirectDriver(
  value: number | null,
  moderateThreshold: number,
  strongThreshold: number,
  label: string,
): OilMacroDriverResult {
  if (
    value === null ||
    !Number.isFinite(
      value,
    )
  ) {
    return {
      score: 0,
      available: false,
      reason:
        `${label} data is unavailable.`,
    };
  }

  const absoluteValue =
    Math.abs(
      value,
    );

  let magnitude = 0.25;

  if (
    absoluteValue >=
    strongThreshold
  ) {
    magnitude = 1;
  } else if (
    absoluteValue >=
    moderateThreshold
  ) {
    magnitude = 0.6;
  }

  if (
    value > 0
  ) {
    return {
      score: magnitude,
      available: true,
      reason:
        `${label} is increasing and supports Oil demand conditions.`,
    };
  }

  if (
    value < 0
  ) {
    return {
      score: -magnitude,
      available: true,
      reason:
        `${label} is weakening and reduces support for Oil.`,
    };
  }

  return {
    score: 0,
    available: true,
    reason:
      `${label} is broadly stable.`,
  };
}

function scoreInverseDriver(
  value: number | null,
  moderateThreshold: number,
  strongThreshold: number,
  label: string,
): OilMacroDriverResult {
  if (
    value === null ||
    !Number.isFinite(
      value,
    )
  ) {
    return {
      score: 0,
      available: false,
      reason:
        `${label} data is unavailable.`,
    };
  }

  const absoluteValue =
    Math.abs(
      value,
    );

  let magnitude = 0.25;

  if (
    absoluteValue >=
    strongThreshold
  ) {
    magnitude = 1;
  } else if (
    absoluteValue >=
    moderateThreshold
  ) {
    magnitude = 0.6;
  }

  if (
    value > 0
  ) {
    return {
      score: -magnitude,
      available: true,
      reason:
        `${label} is increasing and creates pressure on Oil.`,
    };
  }

  if (
    value < 0
  ) {
    return {
      score: magnitude,
      available: true,
      reason:
        `${label} is declining and provides support for Oil.`,
    };
  }

  return {
    score: 0,
    available: true,
    reason:
      `${label} is broadly stable.`,
  };
}

function clamp(
  value: number,
  min: number,
  max: number,
): number {
  return Math.min(
    max,
    Math.max(
      min,
      value,
    ),
  );
}
