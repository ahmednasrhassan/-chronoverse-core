import {
  calculateCanonicalMacroFeaturesV3,
  type CanonicalMacroFeaturesSectionV3,
} from "../../engine/macroFeatures";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function assertClose(actual: number, expected: number, label: string): void {
  if (Math.abs(actual - expected) > Number.EPSILON * 8) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function requireUsable(
  section: CanonicalMacroFeaturesSectionV3,
  label: string,
) {
  if (section.availability !== "available" && section.availability !== "partial") {
    throw new Error(`${label}: expected usable, received ${section.availability}`);
  }

  return section;
}

const full = requireUsable(
  calculateCanonicalMacroFeaturesV3({
    availability: "applicable",
    drivers: [
      {
        id: "support",
        weight: 0.4,
        availability: "available",
        score: 1,
        observedAt: " 2026-01-01T00:00:00.000Z ",
      },
      {
        id: "pressure",
        weight: 0.6,
        availability: "available",
        score: -0.5,
      },
    ],
  }),
  "full coverage",
);

assertEqual(full.availability, "available", "full availability");
assertClose(full.data.coverage, 1, "full coverage");
assertClose(full.data.score, 0.1, "weighted conditional mean");
assertClose(full.data.strengthMagnitude, 0.1, "absolute strength");
assertEqual(
  full.data.drivers[1]?.availability === "available"
    ? full.data.drivers[1].observedAt
    : null,
  "2026-01-01T00:00:00.000Z",
  "observedAt normalization",
);

const partial = requireUsable(
  calculateCanonicalMacroFeaturesV3({
    availability: "applicable",
    drivers: [
      { id: "z-missing", weight: 0.25, availability: "unavailable" },
      { id: "available", weight: 0.5, availability: "available", score: 0.5 },
      { id: "a-missing", weight: 0.25, availability: "unavailable" },
    ],
  }),
  "partial coverage",
);

assertEqual(partial.availability, "partial", "partial availability");
assertClose(partial.data.coverage, 0.5, "partial coverage");
assertClose(partial.data.score, 0.5, "partial conditional score");
assertEqual(
  partial.availability === "partial" ? partial.missing.join(",") : null,
  "a-missing,z-missing",
  "deterministic missing ordering",
);

const sameScoreFull = requireUsable(
  calculateCanonicalMacroFeaturesV3({
    availability: "applicable",
    drivers: [
      { id: "a", weight: 0.5, availability: "available", score: 0.5 },
      { id: "b", weight: 0.5, availability: "available", score: 0.5 },
    ],
  }),
  "same score full",
);
assertClose(
  sameScoreFull.data.score,
  partial.data.score,
  "coverage is not folded into score",
);

const noUsable = calculateCanonicalMacroFeaturesV3({
  availability: "applicable",
  drivers: [
    { id: "missing", weight: 1, availability: "unavailable" },
  ],
});
assertEqual(noUsable.availability, "unavailable", "zero usable drivers");

for (const [section, label] of [
  [
    calculateCanonicalMacroFeaturesV3({
      availability: "applicable",
      drivers: [{ id: "invalid-weight", weight: 0, availability: "available", score: 0 }],
    }),
    "invalid weight",
  ],
  [
    calculateCanonicalMacroFeaturesV3({
      availability: "applicable",
      drivers: [{ id: "invalid-score", weight: 1, availability: "available", score: 1.01 }],
    }),
    "invalid score",
  ],
  [
    calculateCanonicalMacroFeaturesV3({
      availability: "applicable",
      drivers: [
        { id: " duplicate ", weight: 0.5, availability: "available", score: 1 },
        { id: "duplicate", weight: 0.5, availability: "available", score: -1 },
      ],
    }),
    "duplicate id",
  ],
] as const) {
  assertEqual(section.availability, "unavailable", label);
}

assertEqual(
  calculateCanonicalMacroFeaturesV3({
    availability: "not-applicable",
    reason: "No canonical macro model",
  }).availability,
  "not-applicable",
  "not-applicable lifecycle",
);
assertEqual(
  calculateCanonicalMacroFeaturesV3({ availability: "not-computed" }).availability,
  "not-computed",
  "not-computed lifecycle",
);

console.log("PASS: Canonical Macro Features aggregation");
