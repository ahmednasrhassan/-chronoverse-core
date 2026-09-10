import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { eurusdProfile } from "../../assets/eurusd/profile";
import {
  runEcbFxCalibrationStudyV1,
  type EcbFxCalibrationFixtureV1,
  type EcbFxCalibrationProductV1,
} from "./fxCalibration";

export const ECB_FX_FAMILY_PRODUCTS_V1 = Object.freeze([
  Object.freeze({
    productId: "eurjpy",
    seriesId: "EXR.D.JPY.EUR.SP00.A",
    seriesKey: "D.JPY.EUR.SP00.A",
    unit: "JPY per EUR",
    quotation: "EUR 1 = X JPY",
    fixtureSha256:
      "6140d07405d0c94d3b64ca310b7ec877fd2cfcf2feee314dd57f0066819af54d",
  }),
  Object.freeze({
    productId: "eurgbp",
    seriesId: "EXR.D.GBP.EUR.SP00.A",
    seriesKey: "D.GBP.EUR.SP00.A",
    unit: "GBP per EUR",
    quotation: "EUR 1 = X GBP",
    fixtureSha256:
      "a458172b81b190b6ec7963618f8884fd5c7bd0f97957a34ea54d45ae0ddbdf6a",
  }),
  Object.freeze({
    productId: "eurchf",
    seriesId: "EXR.D.CHF.EUR.SP00.A",
    seriesKey: "D.CHF.EUR.SP00.A",
    unit: "CHF per EUR",
    quotation: "EUR 1 = X CHF",
    fixtureSha256:
      "891cfab363cc66c94ce73f6c917afdb2ebc878e72d2b3097e34051c5939d2f0a",
  }),
] as const satisfies readonly EcbFxCalibrationProductV1[]);

export function runEcbFxFamilyCalibrationStudyV1() {
  const studies = ECB_FX_FAMILY_PRODUCTS_V1.map((product) => {
    const fixtureUrl = new URL(
      `./fixtures/${product.productId}-ecb-reference.json`,
      import.meta.url,
    );
    const fixtureBytes = readFileSync(fileURLToPath(fixtureUrl));
    const fixture = JSON.parse(fixtureBytes.toString("utf8")) as
      EcbFxCalibrationFixtureV1;
    return runEcbFxCalibrationStudyV1({
      product,
      fixture,
      fixtureBytes,
      baseProfile: eurusdProfile,
    });
  });
  const volatilityRanking = [...studies]
    .sort((left, right) =>
      left.calibrationDistributions.annualizedVolatility.mean -
      right.calibrationDistributions.annualizedVolatility.mean)
    .map((study) => Object.freeze({
      productId: study.productId,
      calibrationMeanAnnualizedVolatility:
        study.calibrationDistributions.annualizedVolatility.mean,
    }));
  const allTechnicalWindowsUsable = studies.every(
    (study) => study.technicalWindows.usable,
  );
  const allGapAuditsPass = studies.every(
    (study) => study.publicationGapAudit.noClassificationArtifact,
  );
  const allCandidatesIdentical = studies.slice(1).every((study) =>
    JSON.stringify(study.frozenCandidate) ===
      JSON.stringify(studies[0]!.frozenCandidate));

  return Object.freeze({
    schemaVersion: "ecb-fx-family-calibration-study-v1",
    generatedFrom: "immutable-local-fixtures",
    acquisition: Object.freeze({
      strategy: "one-official-ecb-multi-series-request",
      requestedSeries: Object.freeze(ECB_FX_FAMILY_PRODUCTS_V1.map(
        (product) => product.seriesId,
      )),
      eurusdReacquired: false,
      rawArtifactSha256:
        "9db65db9bf2ec7701985b6a35452b1ed99d203b9d876447c1e7e506670bf8379",
      rawArtifactSizeBytes: 4_590_806,
      failedHttp500AttemptsBeforeSuccessfulAcquisition: 2,
      successfulAcquisitions: 1,
      repeatedNetworkAcquisition: false,
    }),
    studies: Object.freeze(studies),
    familyAnalysis: Object.freeze({
      comparedWith: "accepted EUR/USD Calibration Study V1 and calibrated EUR/USD profile",
      technicalWindowVerdict: allTechnicalWindowsUsable
        ? "EMA 20/50/200, RSI 14, MACD 12/26/9, ROC 10, volatility 20, and 252 annualization are usable FX-family defaults."
        : "At least one pair has a structural Technical-window blocker.",
      sharedMethodologyValues: Object.freeze([
        "Signal/Risk component weights",
        "EMA/RSI/MACD/ROC vote multipliers",
        "Signal confidence coefficients",
        "Risk severity values",
        "70/30 chronological split and 200-observation warm-up",
      ]),
      pairSpecificEvidenceValues: Object.freeze([
        "Signal direction and strength bands",
        "EMA tolerance and MACD epsilon",
        "ROC directional and strong thresholds",
        "Risk final bands",
        "volatility, RSI, ROC, MACD, EMA50, and EMA200 Risk thresholds",
      ]),
      coincidentDerivedValues: Object.freeze([
        "All three: Signal neutral=0.30, bearish=-0.80, strong-strength=0.85; Risk low=0.20 and moderate=0.25.",
        "EUR/JPY and EUR/GBP: Signal bullish=0.80 and Risk high=0.50.",
        "EUR/GBP and EUR/CHF: EMA tolerance=0.0001 and Signal MACD epsilon=0.0001.",
        "Coincidence does not establish a shared production constant; candidates remain pair-specific.",
      ]),
      allCandidatesIdentical,
      recommendation: "Share Engine semantics and calibration methodology; retain pair-specific calibration values.",
      volatilityRanking: Object.freeze(volatilityRanking),
      structuralDifferenceAssessment:
        "EUR/JPY is the highest-dispersion member and its absolute MACD thresholds reflect its larger quotation scale; this is expected scale dependence, not evidence of a different Engine semantic.",
      highestDispersionPair: volatilityRanking.at(-1)?.productId ?? null,
      genericReferenceRateEngineAppropriate:
        allTechnicalWindowsUsable && allGapAuditsPass,
      productionChangesAuthorized: false,
      eurusdCalibrationReference: Object.freeze({
        signal: eurusdProfile.signal,
        risk: eurusdProfile.risk,
      }),
    }),
  });
}

const isDirectExecution = process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === fileURLToPath(new URL(
    `file:///${process.argv[1].replaceAll("\\", "/")}`,
  ));

if (isDirectExecution) {
  console.log(JSON.stringify(runEcbFxFamilyCalibrationStudyV1(), null, 2));
}
