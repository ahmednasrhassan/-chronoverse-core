import type { CanonicalStatisticalFrequencyV1 } from "./canonicalObservationSeries";
import {
  selectCanonicalStatisticalSeriesAsKnownAtV1,
  type CanonicalStatisticalSeriesMemoryV1,
  type CanonicalStatisticalSeriesSnapshotV1,
} from "./canonicalStatisticalSeriesMemory";

export const CANONICAL_EURO_AREA_MACRO_STATE_SCHEMA_VERSION_V1 =
  "canonical-euro-area-macro-state-v1" as const;

export type CanonicalEuroAreaMacroFamilyV1 =
  | "hicp"
  | "gdp"
  | "unemployment";

export type CanonicalEuroAreaMacroStateAvailabilityV1 =
  | "available"
  | "partial"
  | "unavailable";

export type CanonicalEuroAreaMacroComponentUnavailableReasonV1 =
  | "memory-unavailable"
  | "not-known-as-of";

export interface CanonicalEuroAreaMacroSeriesBindingV1 {
  readonly expectedCanonicalSeriesId: string;
  readonly memory: CanonicalStatisticalSeriesMemoryV1 | null;
}

export type CanonicalEuroAreaMacroComponentV1 =
  | {
      readonly availability: "available";
      readonly snapshot: CanonicalStatisticalSeriesSnapshotV1;
    }
  | {
      readonly availability: "unavailable";
      readonly reason: CanonicalEuroAreaMacroComponentUnavailableReasonV1;
    };

export interface CanonicalEuroAreaMacroStateInputV1 {
  /** Explicit Unix-seconds boundary for what Chronoverse knew. */
  readonly asOf: number;
  readonly hicp: CanonicalEuroAreaMacroSeriesBindingV1;
  readonly gdp: CanonicalEuroAreaMacroSeriesBindingV1;
  readonly unemployment: CanonicalEuroAreaMacroSeriesBindingV1;
}

/**
 * Statistical Euro-area state only. ECB policy-rate facts require a separate
 * as-known bridge and are deliberately excluded from this contract.
 */
export interface CanonicalEuroAreaMacroStateV1 {
  readonly schemaVersion:
    typeof CANONICAL_EURO_AREA_MACRO_STATE_SCHEMA_VERSION_V1;
  readonly asOf: number;
  readonly availability: CanonicalEuroAreaMacroStateAvailabilityV1;
  readonly hicp: CanonicalEuroAreaMacroComponentV1;
  readonly gdp: CanonicalEuroAreaMacroComponentV1;
  readonly unemployment: CanonicalEuroAreaMacroComponentV1;
  readonly missingFamilies: readonly CanonicalEuroAreaMacroFamilyV1[];
}

const MACRO_FAMILIES = Object.freeze([
  "hicp",
  "gdp",
  "unemployment",
] as const satisfies readonly CanonicalEuroAreaMacroFamilyV1[]);

const EXPECTED_FREQUENCY: Readonly<
  Record<CanonicalEuroAreaMacroFamilyV1, CanonicalStatisticalFrequencyV1>
> = Object.freeze({
  hicp: "monthly",
  gdp: "quarterly",
  unemployment: "monthly",
});

export function buildCanonicalEuroAreaMacroStateV1(
  input: CanonicalEuroAreaMacroStateInputV1,
): CanonicalEuroAreaMacroStateV1 {
  assertAsOf(input.asOf);

  const expectedCanonicalSeriesIds = MACRO_FAMILIES.map((family) =>
    assertExpectedCanonicalSeriesId(
      input[family].expectedCanonicalSeriesId,
      family,
    )
  );

  if (new Set(expectedCanonicalSeriesIds).size !== MACRO_FAMILIES.length) {
    throw new TypeError(
      "Canonical Euro-area macro expected series IDs must be distinct.",
    );
  }

  const hicp = buildComponent("hicp", input.hicp, input.asOf);
  const gdp = buildComponent("gdp", input.gdp, input.asOf);
  const unemployment = buildComponent(
    "unemployment",
    input.unemployment,
    input.asOf,
  );
  const components = { hicp, gdp, unemployment } as const;
  const missingFamilies = Object.freeze(
    MACRO_FAMILIES.filter(
      (family) => components[family].availability === "unavailable",
    ),
  );
  const availability: CanonicalEuroAreaMacroStateAvailabilityV1 =
    missingFamilies.length === 0
      ? "available"
      : missingFamilies.length === MACRO_FAMILIES.length
        ? "unavailable"
        : "partial";

  return Object.freeze({
    schemaVersion: CANONICAL_EURO_AREA_MACRO_STATE_SCHEMA_VERSION_V1,
    asOf: input.asOf,
    availability,
    hicp,
    gdp,
    unemployment,
    missingFamilies,
  });
}

function buildComponent(
  family: CanonicalEuroAreaMacroFamilyV1,
  binding: CanonicalEuroAreaMacroSeriesBindingV1,
  asOf: number,
): CanonicalEuroAreaMacroComponentV1 {
  if (binding.memory === null) {
    return Object.freeze({
      availability: "unavailable" as const,
      reason: "memory-unavailable" as const,
    });
  }

  const snapshot = selectCanonicalStatisticalSeriesAsKnownAtV1(
    binding.memory,
    asOf,
  );

  if (binding.memory.canonicalSeriesId !== binding.expectedCanonicalSeriesId) {
    throw new TypeError(
      `Canonical Euro-area ${family} memory series ID does not match its binding.`,
    );
  }

  const expectedFrequency = EXPECTED_FREQUENCY[family];
  if (
    binding.memory.snapshots.some(
      (candidate) => candidate.series.metadata.frequency !== expectedFrequency,
    )
  ) {
    throw new TypeError(
      `Canonical Euro-area ${family} memory frequency must be ${expectedFrequency}.`,
    );
  }

  return snapshot === null
    ? Object.freeze({
        availability: "unavailable" as const,
        reason: "not-known-as-of" as const,
      })
    : Object.freeze({ availability: "available" as const, snapshot });
}

function assertAsOf(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("Canonical Euro-area macro asOf is invalid.");
  }
}

function assertExpectedCanonicalSeriesId(
  value: string,
  family: CanonicalEuroAreaMacroFamilyV1,
): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim()
  ) {
    throw new TypeError(
      `Canonical Euro-area ${family} expected series ID is invalid.`,
    );
  }

  return value;
}
