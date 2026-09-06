export type CanonicalMacroDriverInputV3 =
  | {
      readonly id: string;
      readonly weight: number;
      readonly availability: "available";
      readonly score: number;
      readonly observedAt?: string;
    }
  | {
      readonly id: string;
      readonly weight: number;
      readonly availability: "unavailable";
      readonly reason?: string;
    };

export type CanonicalMacroFeaturesInputV3 =
  | {
      readonly availability: "applicable";
      readonly drivers: readonly CanonicalMacroDriverInputV3[];
    }
  | {
      readonly availability: "not-applicable";
      readonly reason?: string;
    }
  | {
      readonly availability: "not-computed";
    };

export type CanonicalMacroDriverV3 =
  | {
      readonly id: string;
      readonly weight: number;
      readonly availability: "available";
      readonly score: number;
      readonly observedAt?: string;
    }
  | {
      readonly id: string;
      readonly weight: number;
      readonly availability: "unavailable";
      readonly reason?: string;
    };

export interface CanonicalMacroFeaturesV3 {
  /** Signed conditional evidence strength normalized to -1..1. */
  readonly score: number;
  /** Absolute conditional evidence strength normalized to 0..1. */
  readonly strengthMagnitude: number;
  /** Required weighted evidence completeness normalized to 0..1. */
  readonly coverage: number;
  readonly drivers: readonly CanonicalMacroDriverV3[];
}

export type CanonicalMacroFeaturesSectionV3 =
  | {
      readonly availability: "available";
      readonly data: CanonicalMacroFeaturesV3;
    }
  | {
      readonly availability: "partial";
      readonly data: CanonicalMacroFeaturesV3;
      readonly missing: readonly string[];
    }
  | {
      readonly availability: "unavailable";
      readonly reason: string;
    }
  | {
      readonly availability: "not-applicable";
      readonly reason?: string;
    }
  | {
      readonly availability: "not-computed";
    };

const INVALID_CONFIGURATION_REASON =
  "Canonical macro driver configuration is invalid.";
const NO_USABLE_EVIDENCE_REASON =
  "No usable canonical macro evidence is available.";

/**
 * Pure provider-agnostic aggregation of already normalized macro drivers.
 * Asset adapters retain ownership of score interpretation and direction bands.
 */
export function calculateCanonicalMacroFeaturesV3(
  input: CanonicalMacroFeaturesInputV3,
): CanonicalMacroFeaturesSectionV3 {
  if (input.availability !== "applicable") {
    return input;
  }

  const normalizedDrivers = input.drivers
    .map(normalizeDriver)
    .sort((left, right) => compareIdentifiers(left.id, right.id));

  if (
    normalizedDrivers.length === 0 ||
    normalizedDrivers.some((driver) => driver.id.length === 0) ||
    normalizedDrivers.some(
      (driver) => !Number.isFinite(driver.weight) || driver.weight <= 0,
    ) ||
    normalizedDrivers.some(
      (driver) =>
        driver.availability === "available" &&
        (!Number.isFinite(driver.score) || driver.score < -1 || driver.score > 1),
    ) ||
    normalizedDrivers.some(
      (driver, index) => driver.id === normalizedDrivers[index - 1]?.id,
    )
  ) {
    return {
      availability: "unavailable",
      reason: INVALID_CONFIGURATION_REASON,
    };
  }

  const totalWeight = normalizedDrivers.reduce(
    (total, driver) => total + driver.weight,
    0,
  );

  if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
    return {
      availability: "unavailable",
      reason: INVALID_CONFIGURATION_REASON,
    };
  }

  const availableDrivers = normalizedDrivers.filter(
    (driver): driver is Extract<CanonicalMacroDriverV3, { availability: "available" }> =>
      driver.availability === "available",
  );
  const availableWeight = availableDrivers.reduce(
    (total, driver) => total + driver.weight,
    0,
  );

  if (availableDrivers.length === 0 || availableWeight <= 0) {
    return {
      availability: "unavailable",
      reason: NO_USABLE_EVIDENCE_REASON,
    };
  }

  const weightedScore = availableDrivers.reduce(
    (total, driver) => total + driver.weight * driver.score,
    0,
  );
  const score = clampSigned(weightedScore / availableWeight);
  const data: CanonicalMacroFeaturesV3 = {
    score,
    strengthMagnitude: Math.abs(score),
    coverage: clamp01(availableWeight / totalWeight),
    drivers: normalizedDrivers,
  };
  const missing = normalizedDrivers
    .filter((driver) => driver.availability === "unavailable")
    .map((driver) => driver.id);

  return missing.length === 0
    ? { availability: "available", data }
    : { availability: "partial", data, missing };
}

function normalizeDriver(
  driver: CanonicalMacroDriverInputV3,
): CanonicalMacroDriverV3 {
  const id = driver.id.trim();

  if (driver.availability === "available") {
    const observedAt = driver.observedAt?.trim();

    return {
      id,
      weight: driver.weight,
      availability: "available",
      score: driver.score,
      ...(observedAt ? { observedAt } : {}),
    };
  }

  const reason = driver.reason?.trim();

  return {
    id,
    weight: driver.weight,
    availability: "unavailable",
    ...(reason ? { reason } : {}),
  };
}

function clampSigned(value: number): number {
  return Math.min(1, Math.max(-1, value));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function compareIdentifiers(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
