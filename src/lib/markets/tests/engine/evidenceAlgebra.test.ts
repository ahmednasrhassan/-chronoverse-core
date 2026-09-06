import {
  calculateCorroborativeEvidenceV1,
  calculatePrimaryEvidenceAlgebraV3,
  calculateRoleAwareEvidenceV1,
  ENGINE_V3_EVIDENCE_POLICY,
  type PrimaryEvidenceAlgebraV3,
  type PrimaryEvidenceChannelV3,
} from "../../engine/evidenceAlgebra";

function channel(
  id: string,
  score: number,
  coverage = 1,
): PrimaryEvidenceChannelV3 {
  return {
    id,
    evidenceRole: "primary",
    score,
    architecturePrior: 1,
    coverage,
  };
}

function primary(
  signalScore: number,
  macroScore?: number,
  macroCoverage = 1,
): PrimaryEvidenceAlgebraV3 {
  return calculatePrimaryEvidenceAlgebraV3([
    channel("signal", signalScore),
    ...(macroScore === undefined
      ? []
      : [channel("macro", macroScore, macroCoverage)]),
  ]);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertClose(
  actual: number,
  expected: number,
  label: string,
  tolerance = Number.EPSILON * 16,
): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertThrows(run: () => unknown, label: string): void {
  let threw = false;

  try {
    run();
  } catch {
    threw = true;
  }

  assertEqual(threw, true, label);
}

assertEqual(ENGINE_V3_EVIDENCE_POLICY.signal.evidenceRole, "primary", "Signal role");
assertEqual(ENGINE_V3_EVIDENCE_POLICY.signal.mandatory, true, "Signal mandatory");
assertEqual(ENGINE_V3_EVIDENCE_POLICY.macro.evidenceRole, "primary", "Macro role");
assertEqual(ENGINE_V3_EVIDENCE_POLICY.crossAsset.evidenceRole, "corroborative", "Cross-Asset role");
assertEqual(ENGINE_V3_EVIDENCE_POLICY.technical.evidenceVote, false, "Technical ownership");
assertEqual(ENGINE_V3_EVIDENCE_POLICY.state.evidenceVote, false, "State derived");
assertEqual(ENGINE_V3_EVIDENCE_POLICY.regime.evidenceVote, false, "Regime derived");

const signalOnly = primary(0.8);
assertClose(signalOnly.rawEvidenceStrength, 0.8, "Signal-only raw strength");
assertClose(signalOnly.primaryContradiction, 0, "Signal-only contradiction");
assertClose(signalOnly.primarySignedBalance, 0.8, "Signal-only balance");
assertClose(signalOnly.primaryConviction, 0.8, "Signal-only conviction");

for (const fixture of [
  { signal: 1, macro: 1, coverage: 1, contradiction: 0, conviction: 1, label: "aligned bullish" },
  { signal: -1, macro: -1, coverage: 1, contradiction: 0, conviction: 1, label: "aligned bearish" },
  { signal: 1, macro: -1, coverage: 1, contradiction: 1, conviction: 0, label: "exact cancellation" },
  { signal: 0.8, macro: -0.4, coverage: 1, contradiction: 0.4, conviction: 0.2, label: "bounded opposition" },
  { signal: 0.8, macro: -0.4, coverage: 0.5, contradiction: 4 / 15, conviction: 0.4, label: "partial Macro" },
  { signal: 0.2, macro: -1, coverage: 0.5, contradiction: 4 / 15, conviction: 0.2, label: "Macro dominant" },
  { signal: 1, macro: -0.2, coverage: 0.5, contradiction: 2 / 15, conviction: 0.6, label: "effective Macro bound" },
  { signal: 0, macro: 1, coverage: 1, contradiction: 0, conviction: 0.5, label: "neutral Signal" },
  { signal: 1, macro: 0, coverage: 1, contradiction: 0, conviction: 0.5, label: "neutral Macro" },
] as const) {
  const result = primary(fixture.signal, fixture.macro, fixture.coverage);

  assertClose(result.primaryContradiction, fixture.contradiction, `${fixture.label} contradiction`);
  assertClose(result.primaryConviction, fixture.conviction, `${fixture.label} conviction`);
  assertClose(
    result.primaryConviction,
    result.rawEvidenceStrength - result.primaryContradiction,
    `${fixture.label} primary invariant`,
  );
  assertClose(
    result.primaryConviction,
    Math.abs(result.primarySignedBalance),
    `${fixture.label} balance invariant`,
  );
}

assertEqual(
  JSON.stringify(calculatePrimaryEvidenceAlgebraV3([
    channel("signal", 0.8),
    channel("macro", -0.4, 0.5),
  ])),
  JSON.stringify(calculatePrimaryEvidenceAlgebraV3([
    channel("macro", -0.4, 0.5),
    channel("signal", 0.8),
  ])),
  "primary permutation invariance",
);

const agreement = calculateCorroborativeEvidenceV1({
  primarySignedBalance: 0.8,
  primaryConviction: 0.8,
  corroborativeScore: 0.8,
  corroborativeCoverage: 1,
});
assertClose(agreement.confirmationStrength, 0.8, "agreement confirmation");
assertClose(agreement.corroborativeContradiction, 0, "agreement contradiction");
assertClose(agreement.finalConviction, 0.8, "agreement no boost");
assertEqual(agreement.decisionScore, 0.8, "agreement Decision");

const disagreement = calculateCorroborativeEvidenceV1({
  primarySignedBalance: 0.8,
  primaryConviction: 0.8,
  corroborativeScore: -0.8,
  corroborativeCoverage: 1,
});
assertClose(disagreement.corroborativeContradiction, 0.8, "full disagreement");
assertClose(disagreement.finalConviction, 0, "full disagreement cancellation");
assertEqual(disagreement.decisionDirection, "neutral", "zero conviction is neutral");
assertEqual(disagreement.decisionScore, 0, "disagreement cannot reverse");

const weakPrimary = calculateCorroborativeEvidenceV1({
  primarySignedBalance: 0.2,
  primaryConviction: 0.2,
  corroborativeScore: 0.9,
  corroborativeCoverage: 1,
});
assertClose(weakPrimary.finalConviction, 0.2, "strong Cross-Asset cannot boost");
assertEqual(weakPrimary.decisionScore, 0.2, "weak primary Decision preserved");

const partialCoverage = calculateCorroborativeEvidenceV1({
  primarySignedBalance: 0.8,
  primaryConviction: 0.8,
  corroborativeScore: -0.8,
  corroborativeCoverage: 0.5,
});
assertClose(partialCoverage.corroborativeCapacity, 0.4, "coverage applied once");
assertClose(partialCoverage.corroborativeContradiction, 0.4, "partial contradiction");
assertClose(partialCoverage.finalConviction, 0.4, "partial final conviction");
assertEqual(partialCoverage.decisionDirection, "bullish", "partial cannot reverse");

const zeroCross = calculateCorroborativeEvidenceV1({
  primarySignedBalance: 0.8,
  primaryConviction: 0.8,
  corroborativeScore: 0,
  corroborativeCoverage: 1,
});
assertClose(zeroCross.confirmationStrength, 0, "zero confirmation");
assertClose(zeroCross.corroborativeContradiction, 0, "zero contradiction");
assertClose(zeroCross.finalConviction, 0.8, "zero score no effect");

const neutralPrimary = calculateCorroborativeEvidenceV1({
  primarySignedBalance: 0,
  primaryConviction: 0,
  corroborativeScore: 1,
  corroborativeCoverage: 1,
});
assertClose(neutralPrimary.finalConviction, 0, "Cross-Asset cannot create conviction");
assertEqual(neutralPrimary.decisionDirection, "neutral", "Cross-Asset cannot create direction");

const basePrimary = primary(0.8);

for (const availability of ["not-applicable", "unavailable", "not-computed"] as const) {
  const result = calculateRoleAwareEvidenceV1({
    mandatorySignalAnchorAvailable: true,
    primary: basePrimary,
    corroborative: { availability },
  });

  if (result.availability === "unavailable") {
    throw new Error(`${availability}: primary evidence was unexpectedly unavailable.`);
  }

  assertClose(result.data.finalConviction, 0.8, `${availability} no effect`);
  assertClose(
    result.data.totalContradiction,
    basePrimary.primaryContradiction,
    `${availability} primary contradiction preserved`,
  );
  assertEqual(
    "score" in result.data.corroborative,
    false,
    `${availability} does not fabricate zero`,
  );
}

const partial = calculateRoleAwareEvidenceV1({
  mandatorySignalAnchorAvailable: true,
  primary: basePrimary,
  corroborative: {
    availability: "partial",
    score: -0.8,
    coverage: 0.5,
    missing: [" z-reference ", "a-reference", "a-reference"],
  },
});
assertEqual(partial.availability, "partial", "partial lifecycle");
assertEqual(
  partial.availability === "partial" ? partial.missing.join(",") : null,
  "a-reference,z-reference",
  "partial missing normalization",
);
if (partial.availability !== "unavailable") {
  assertClose(
    partial.data.finalConviction,
    partial.data.rawEvidenceStrength - partial.data.totalContradiction,
    "total contradiction invariant",
  );
  assertClose(
    Math.abs(partial.data.decisionScore),
    partial.data.finalConviction,
    "combined Decision magnitude invariant",
  );
  assertEqual(
    partial.data.totalContradiction <= partial.data.rawEvidenceStrength,
    true,
    "total contradiction bounded by raw strength",
  );
}

const conflictedPrimary = primary(0.8, -0.4, 0.5);
const fullyCorroboratedConflict = calculateRoleAwareEvidenceV1({
  mandatorySignalAnchorAvailable: true,
  primary: conflictedPrimary,
  corroborative: {
    availability: "available",
    score: -0.8,
    coverage: 0.5,
  },
});

if (fullyCorroboratedConflict.availability === "unavailable") {
  throw new Error("Conflicted primary fixture must remain usable.");
}

assertEqual(
  fullyCorroboratedConflict.data.finalConviction,
  0,
  "combined exact cancellation",
);
assertEqual(
  fullyCorroboratedConflict.data.totalContradiction,
  fullyCorroboratedConflict.data.rawEvidenceStrength,
  "combined exact total contradiction invariant",
);
assertEqual(
  fullyCorroboratedConflict.data.decisionDirection,
  "neutral",
  "combined zero conviction semantics",
);

assertEqual(
  calculateRoleAwareEvidenceV1({
    mandatorySignalAnchorAvailable: false,
    primary: null,
    corroborative: { availability: "available", score: 1, coverage: 1 },
  }).availability,
  "unavailable",
  "no mandatory Signal anchor",
);

for (const sign of [1, -1] as const) {
  for (const crossScore of [-1, -0.5, 0, 0.5, 1] as const) {
    for (const coverage of [0, 0.25, 0.5, 1] as const) {
      const primarySignedBalance = sign * 0.7;
      const result = calculateCorroborativeEvidenceV1({
        primarySignedBalance,
        primaryConviction: 0.7,
        corroborativeScore: crossScore,
        corroborativeCoverage: coverage,
      });

      assertEqual(result.finalConviction >= 0, true, "bounded lower conviction");
      assertEqual(result.finalConviction <= 0.7, true, "no conviction increase");
      assertEqual(
        result.corroborativeContradiction <= 0.7,
        true,
        "bounded corroborative contradiction",
      );
      assertEqual(
        result.decisionScore === 0 || Math.sign(result.decisionScore) === sign,
        true,
        "corroborative evidence cannot reverse",
      );
    }
  }
}

const bullish = calculateCorroborativeEvidenceV1({
  primarySignedBalance: 0.7,
  primaryConviction: 0.7,
  corroborativeScore: -0.4,
  corroborativeCoverage: 0.5,
});
const bearish = calculateCorroborativeEvidenceV1({
  primarySignedBalance: -0.7,
  primaryConviction: 0.7,
  corroborativeScore: 0.4,
  corroborativeCoverage: 0.5,
});
assertClose(bullish.finalConviction, bearish.finalConviction, "sign symmetry conviction");
assertClose(bullish.decisionScore, -bearish.decisionScore, "sign symmetry Decision");

const extraneousRelationshipWeight = {
  primarySignedBalance: 0.8,
  primaryConviction: 0.8,
  corroborativeScore: -0.8,
  corroborativeCoverage: 0.5,
  relationshipWeight: 1_000,
};
assertClose(
  calculateCorroborativeEvidenceV1(extraneousRelationshipWeight).corroborativeCapacity,
  0.4,
  "relationship weight is not channel importance",
);

for (const invalid of [
  () => calculatePrimaryEvidenceAlgebraV3([]),
  () => calculatePrimaryEvidenceAlgebraV3([channel("signal", Number.NaN)]),
  () => calculatePrimaryEvidenceAlgebraV3([channel("signal", 1, 0)]),
  () => calculatePrimaryEvidenceAlgebraV3([channel("same", 1), channel("same", -1)]),
  () => calculateCorroborativeEvidenceV1({
    primarySignedBalance: 0.8,
    primaryConviction: 0.7,
    corroborativeScore: 1,
    corroborativeCoverage: 1,
  }),
] as const) {
  assertThrows(invalid, "invalid evidence configuration");
}

console.log("PASS: Engine V3 pure role-aware evidence algebra");
