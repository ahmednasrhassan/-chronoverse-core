import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  getEstrProductionRuntimeV1,
  type EstrProductionRuntimeResultV1,
} from "../../assets/estr/runtime";
import {
  getCanonicalLiveEurChfIntelligence,
} from "../../assets/eurchf/productionRuntime";
import {
  getCanonicalLiveEurGbpIntelligence,
} from "../../assets/eurgbp/productionRuntime";
import {
  getCanonicalLiveEurJpyIntelligence,
} from "../../assets/eurjpy/productionRuntime";
import {
  getCanonicalLiveEurUsdIntelligence,
} from "../../assets/eurusd/productionRuntime";
import {
  ECB_ESTR_DATAFLOW_V1,
  ECB_ESTR_SERIES_ID_V1,
  ECB_ESTR_SERIES_KEY_V1,
} from "../../providers/ecb/estrContract";
import { ECB_FX_REFERENCE_PRODUCTS_V1 } from
  "../../providers/ecb/fxReferenceSeries";
import type {
  EcbEstrObservationMetadataV1,
  EcbEstrSeriesV1,
} from "../../providers/ecb/estrTypes";
import {
  projectFiveProductFreeLiteV1,
  projectFiveProductVipDeepV1,
} from "../../projections/fiveProductProjections";
import type {
  FiveProductCanonicalProjectionInputV1,
  FxProjectionProductIdV1,
  MarketProductProjectionV1,
} from "../../projections/types";
import {
  CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1,
  normalizeCanonicalObservationSeriesV1,
  type CanonicalObservationSeriesV1,
} from "../../services/canonicalObservationSeries";

const FX_CONFIGURATIONS = Object.freeze([
  Object.freeze({
    productId: "eurusd" as const,
    displayName: "EUR/USD",
    baseValue: 1.08,
    run: getCanonicalLiveEurUsdIntelligence,
  }),
  Object.freeze({
    productId: "eurjpy" as const,
    displayName: "EUR/JPY",
    baseValue: 160,
    run: getCanonicalLiveEurJpyIntelligence,
  }),
  Object.freeze({
    productId: "eurgbp" as const,
    displayName: "EUR/GBP",
    baseValue: 0.85,
    run: getCanonicalLiveEurGbpIntelligence,
  }),
  Object.freeze({
    productId: "eurchf" as const,
    displayName: "EUR/CHF",
    baseValue: 0.94,
    run: getCanonicalLiveEurChfIntelligence,
  }),
]);
const ASSESSED_AT = "2025-09-10T12:00:00.000Z";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, label: string): void {
  assertEqual(JSON.stringify(actual), JSON.stringify(expected), label);
}

function assertAvailable<T extends MarketProductProjectionV1>(
  projection: T,
  label: string,
): asserts projection is Extract<T, { readonly availability: "available" }> {
  if (projection.availability !== "available") {
    throw new Error(`${label}: expected available, received ${projection.reason}`);
  }
}

function officialFxSeries(
  productId: FxProjectionProductIdV1,
  baseValue: number,
): CanonicalObservationSeriesV1 {
  const product = ECB_FX_REFERENCE_PRODUCTS_V1[productId];
  const observations = Array.from({ length: 600 }, (_, index) => ({
    timestamp: 1_700_000_000 + index * 86_400,
    value: baseValue * (1 + index * 0.00001 + Math.sin(index / 9) * 0.002),
  }));

  return normalizeCanonicalObservationSeriesV1({
    observations,
    metadata: {
      provenanceVersion: CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1,
      provider: "ecb",
      source: "European Central Bank",
      originalPublisher: "European Central Bank",
      substitution: { status: "none" },
      seriesId: product.seriesId,
      requestedProductId: productId,
      canonicalProductId: productId,
      interval: "1d",
      fetchedAt: 1_757_491_200,
      observationTimestamp: observations.at(-1)!.timestamp,
      sourceTimestamp: observations.at(-1)!.timestamp,
      status: "end_of_day",
      unit: product.unit,
      seriesKind: "reference-rate",
    },
  });
}

function officialEstrSource(): EcbEstrSeriesV1 {
  const observations = Array.from({ length: 220 }, (_, index) => ({
    timestamp: Date.UTC(2025, 0, 1 + index) / 1_000,
    value: 2 + index * 0.0005 + Math.sin(index / 7) * 0.01,
  }));
  const observationMetadata: readonly EcbEstrObservationMetadataV1[] =
    observations.map((observation) => Object.freeze({
      referenceDate: new Date(observation.timestamp * 1_000)
        .toISOString().slice(0, 10),
      timestamp: observation.timestamp,
      observationStatus: Object.freeze({
        headline: "A",
        publicationType: "A",
        calculationMethod: "A",
      }),
      confidentialityStatus: Object.freeze({
        headline: "F",
        publicationType: "F",
        calculationMethod: "F",
      }),
      publicationType: "standard" as const,
      calculationMethod: "normal" as const,
    }));
  const canonicalSeries = normalizeCanonicalObservationSeriesV1({
    observations,
    metadata: {
      provenanceVersion: CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1,
      provider: "ecb",
      source: "European Central Bank",
      originalPublisher: "European Central Bank",
      substitution: { status: "none" },
      seriesId: ECB_ESTR_SERIES_ID_V1,
      requestedProductId: "estr",
      canonicalProductId: "estr",
      interval: "1d",
      fetchedAt: 1_757_491_200,
      observationTimestamp: observations.at(-1)!.timestamp,
      sourceTimestamp: observations.at(-1)!.timestamp,
      status: "end_of_day",
      unit: "percent",
      seriesKind: "reference-rate",
    },
  });

  return Object.freeze({
    schemaVersion: "ecb-estr-series-v1",
    dataflow: ECB_ESTR_DATAFLOW_V1,
    seriesKey: ECB_ESTR_SERIES_KEY_V1,
    canonicalSeries,
    observationMetadata: Object.freeze(observationMetadata),
  });
}

async function canonicalInputs(): Promise<
  readonly FiveProductCanonicalProjectionInputV1[]
> {
  const fxInputs = await Promise.all(FX_CONFIGURATIONS.map(async (configuration) => ({
    productId: configuration.productId,
    canonical: await configuration.run({
      loadCanonicalSeries: async () => officialFxSeries(
        configuration.productId,
        configuration.baseValue,
      ),
      now: () => new Date("2026-09-10T12:00:00.000Z"),
    }),
  } satisfies FiveProductCanonicalProjectionInputV1)));
  const estrCanonical = await getEstrProductionRuntimeV1({
    loadSource: async () => officialEstrSource(),
  });

  assertEqual(estrCanonical.availability, "available", "\u20acSTR fixture available");

  return Object.freeze([
    ...fxInputs,
    Object.freeze({
      productId: "estr",
      canonical: estrCanonical,
    } satisfies FiveProductCanonicalProjectionInputV1),
  ]);
}

function commonTruth(projection: Extract<
  MarketProductProjectionV1,
  { readonly availability: "available" }
>) {
  return {
    version: projection.version,
    availability: projection.availability,
    productId: projection.productId,
    displayName: projection.displayName,
    productKind: projection.productKind,
    currentValue: projection.currentValue,
    referenceDate: projection.referenceDate,
    fetchedAt: projection.fetchedAt,
    sourceTimestamp: projection.sourceTimestamp,
    interval: projection.interval,
    status: projection.status,
    provenance: projection.provenance,
  };
}

function estrWithDirection(
  canonical: Extract<
    EstrProductionRuntimeResultV1,
    { readonly availability: "available" }
  >,
  direction: "rising-rate" | "falling-rate" | "range-bound",
): EstrProductionRuntimeResultV1 {
  const score = direction === "rising-rate" ? 0.5
    : direction === "falling-rate" ? -0.5
      : 0;
  const strength = direction === "range-bound" ? "range-bound" : "directional";
  const data = canonical.data;
  const signalData = Object.freeze({ ...data.signal.data, score, direction, strength });
  const marketState = Object.freeze({
    ...data.marketState.data,
    direction,
    signalStrength: strength,
    signalScore: score,
  });
  const engineEvidence = Object.freeze({
    ...data.engineAdapter.data.engineEvidence,
    signal: Object.freeze({
      ...data.engineAdapter.data.engineEvidence.signal,
      score,
    }),
  });

  return Object.freeze({
    availability: "available",
    data: Object.freeze({
      ...data,
      signal: Object.freeze({ availability: "available", data: signalData }),
      marketState: Object.freeze({
        availability: "available",
        data: marketState,
      }),
      engineAdapter: Object.freeze({
        availability: "available",
        data: Object.freeze({
          rateMarketState: marketState,
          engineEvidence,
        }),
      }),
    }),
  });
}

function assertNoEstrSemanticLeakage(value: unknown, label: string): void {
  const serialized = JSON.stringify(value).toLowerCase();

  for (const forbidden of [
    "bullish",
    "bearish",
    '"price"',
    "percentageroc",
    "percentage roc",
    "log-return",
    "logreturn",
    "emadistancepercent",
    "trade-direction",
  ]) {
    assertEqual(serialized.includes(forbidden), false, `${label} excludes ${forbidden}`);
  }
}

function auditProjectionSources(): void {
  const projectionDirectory = fileURLToPath(new URL(
    "../../projections/",
    import.meta.url,
  ));
  const builderSource = readFileSync(
    `${projectionDirectory}fiveProductProjections.ts`,
    "utf8",
  );
  const lower = builderSource.toLowerCase();

  for (const forbidden of [
    "fetch(",
    "unstable_cache",
    "session",
    "entitlement",
    "lemon",
    "process.env",
    "calculatemarketintelligence",
    "calculateestrratesignal",
    "calculateestrraterisk",
    "getcanonicalecb",
  ]) {
    assertEqual(lower.includes(forbidden), false,
      `pure projection source excludes ${forbidden}`);
  }
  assertEqual(lower.includes("stale: false"), false,
    "projection has no hard-coded non-stale claim");
}

async function main(): Promise<void> {
  const inputs = await canonicalInputs();
  assertEqual(inputs.length, 5, "exactly five launch products");

  for (const input of inputs) {
    const before = JSON.stringify(input.canonical);
    const free = projectFiveProductFreeLiteV1(input, ASSESSED_AT);
    const vip = projectFiveProductVipDeepV1(input, ASSESSED_AT);

    assertAvailable(free, `${input.productId} Free`);
    assertAvailable(vip, `${input.productId} VIP`);
    assertDeepEqual(commonTruth(free), commonTruth(vip),
      `${input.productId} tiers share canonical truth`);
    assertEqual(free.productId, input.productId,
      `${input.productId} Free identity preserved`);
    assertEqual(vip.productId, input.productId,
      `${input.productId} VIP identity preserved`);
    assertEqual(free.provenance.canonicalProductId, input.productId,
      `${input.productId} provenance identity preserved`);
    assertEqual(free.provenance.provider, "ecb",
      `${input.productId} provider preserved`);
    assertEqual(free.provenance.source, "European Central Bank",
      `${input.productId} source preserved`);
    assertEqual(free.referenceDate, free.provenance.referenceDate,
      `${input.productId} reference date harmonized`);
    assertEqual(free.fetchedAt, free.provenance.fetchedAt,
      `${input.productId} fetchedAt preserved`);
    assertEqual(free.sourceTimestamp, free.provenance.sourceTimestamp,
      `${input.productId} source timestamp preserved`);
    assertEqual(free.provenance.version, CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1,
      `${input.productId} provenance version`);
    assertEqual(free.provenance.originalPublisher, "European Central Bank",
      `${input.productId} original publisher preserved`);
    assertEqual(free.provenance.substitution.status, "none",
      `${input.productId} no substitute provider`);
    assertEqual(free.provenance.observationTimestamp, free.sourceTimestamp,
      `${input.productId} observation time preserved`);
    assertEqual(free.provenance.observationTimestamp !== free.fetchedAt, true,
      `${input.productId} observation and fetch time remain distinct`);
    assertEqual(free.provenance.releaseTimestamp, null,
      `${input.productId} unsourced release time remains unknown`);
    assertEqual(free.provenance.freshness, "stale",
      `${input.productId} old reference observation is stale`);
    assertEqual(free.provenance.freshnessAssessedAt, ASSESSED_AT,
      `${input.productId} freshness clock preserved`);
    const withinCadenceAt = new Date(
      (free.sourceTimestamp + 86_400) * 1_000,
    ).toISOString();
    const fresh = projectFiveProductFreeLiteV1(input, withinCadenceAt);
    assertAvailable(fresh, `${input.productId} current daily observation`);
    assertEqual(fresh.provenance.freshness, "within-cadence",
      `${input.productId} current daily observation is fresh`);
    const unknown = projectFiveProductFreeLiteV1(input, "invalid-time");
    assertAvailable(unknown, `${input.productId} unknown assessment time`);
    assertEqual(unknown.provenance.freshness, "unknown",
      `${input.productId} missing valid assessment time is unknown`);
    assertEqual(unknown.provenance.freshnessAssessedAt, null,
      `${input.productId} invalid assessment time is not published`);
    assertEqual(JSON.stringify(input.canonical), before,
      `${input.productId} canonical input is not mutated`);
    assertDeepEqual(projectFiveProductFreeLiteV1(input, ASSESSED_AT), free,
      `${input.productId} repeated Free projection deterministic`);
    assertDeepEqual(projectFiveProductVipDeepV1(input, ASSESSED_AT), vip,
      `${input.productId} repeated VIP projection deterministic`);

    if (input.productId === "estr") {
      assertEqual(free.details.kind, "rate", "\u20acSTR Free rate details");
      assertEqual(vip.details.kind, "rate", "\u20acSTR VIP rate details");
      if (free.details.kind !== "rate" || vip.details.kind !== "rate" ||
        input.canonical.availability !== "available") {
        throw new Error("Expected available rate projection fixtures.");
      }

      const state = input.canonical.data.marketState.data;
      assertEqual(free.provenance.publicationType, "standard",
        "€STR publication type preserved");
      const republished = Object.freeze({
        productId: "estr" as const,
        canonical: Object.freeze({
          ...input.canonical,
          data: Object.freeze({
            ...input.canonical.data,
            source: Object.freeze({
              ...input.canonical.data.source,
              latestObservationMetadata: Object.freeze({
                ...input.canonical.data.source.latestObservationMetadata,
                publicationType: "republication" as const,
              }),
            }),
          }),
        }),
      });
      const republishedProjection = projectFiveProductVipDeepV1(
        republished, ASSESSED_AT,
      );
      assertAvailable(republishedProjection, "€STR republication projection");
      assertEqual(republishedProjection.provenance.publicationType, "republication",
        "€STR republication metadata survives Deep projection");
      assertEqual(free.details.currentRatePercent,
        input.canonical.data.currentRatePercent, "Free current rate preserved");
      assertEqual(free.details.direction, state.direction,
        "Free rate direction preserved");
      assertEqual(free.details.signalStrength, state.signalStrength,
        "Free rate signal strength preserved");
      assertEqual(free.details.riskLevel, state.riskLevel,
        "Free rate-market Risk preserved");
      assertEqual(free.details.levelRegime, state.levelRegime,
        "Free rate-level regime preserved");
      assertEqual(free.details.volatilityRegime, state.volatilityRegime,
        "Free bp-volatility regime preserved");
      assertEqual("signal" in free.details, false,
        "Free rate details exclude deep Signal result");
      assertEqual("rateFeatures" in free.details, false,
        "Free rate details exclude deep rate features");
      assertEqual(vip.details.signal, input.canonical.data.signal.data,
        "VIP rate Signal preserved exactly");
      assertEqual(vip.details.risk, input.canonical.data.risk.data,
        "VIP rate Risk preserved exactly");
      assertEqual(vip.details.marketState, state,
        "VIP rate Market State preserved exactly");
      assertEqual(vip.details.engineEvidence,
        input.canonical.data.engineAdapter.data.engineEvidence,
      "VIP safe Engine evidence preserved exactly");
      assertEqual("decision" in vip.details, false,
        "VIP rate projection does not invent Decision");
      assertEqual("scenario" in vip.details, false,
        "VIP rate projection does not invent Scenario");
      assertEqual("recommendation" in vip.details, false,
        "VIP rate projection does not invent Recommendation");
      assertNoEstrSemanticLeakage(free, "Free \u20acSTR");
      assertNoEstrSemanticLeakage(vip, "VIP \u20acSTR");
    } else {
      const configuration = FX_CONFIGURATIONS.find(
        (candidate) => candidate.productId === input.productId,
      )!;

      assertEqual(free.displayName, configuration.displayName,
        `${input.productId} pair display name preserved`);
      assertEqual(free.details.kind, "fx", `${input.productId} Free FX details`);
      assertEqual(vip.details.kind, "fx", `${input.productId} VIP FX details`);
      if (free.details.kind !== "fx" || vip.details.kind !== "fx" ||
        input.canonical.availability !== "available") {
        throw new Error("Expected available FX projection fixtures.");
      }

      const canonical = input.canonical;
      assertEqual(free.details.direction, canonical.intelligence.signal.direction,
        `${input.productId} FX direction unchanged`);
      assertEqual(free.details.marketState, canonical.intelligence.state,
        `${input.productId} FX state unchanged`);
      assertEqual(free.details.riskLevel, canonical.intelligence.risk.level,
        `${input.productId} FX Risk unchanged`);
      assertEqual("signal" in free.details, false,
        `${input.productId} Free excludes full Signal`);
      assertEqual("technical" in free.details, false,
        `${input.productId} Free excludes full Technical`);
      assertEqual("engine" in free.details, false,
        `${input.productId} Free excludes Engine depth`);
      assertEqual(vip.details.signal, canonical.intelligence.signal,
        `${input.productId} VIP Signal exact`);
      assertEqual(vip.details.risk, canonical.intelligence.risk,
        `${input.productId} VIP Risk exact`);
      assertEqual(vip.details.technical, canonical.intelligence.technical,
        `${input.productId} VIP Technical exact`);
      assertEqual(vip.details.engine.decision, canonical.engineResult.decision,
        `${input.productId} VIP Decision exact`);
      assertEqual(vip.details.engine.scenario, canonical.engineResult.scenario,
        `${input.productId} VIP Scenario exact`);
      assertEqual(vip.details.engine.recommendation,
        canonical.engineResult.recommendation,
      `${input.productId} VIP Recommendation exact`);
      assertEqual("marketData" in vip.details.engine, false,
        `${input.productId} VIP excludes raw market-data window`);
    }
  }

  const legacyFx = inputs.find((input) => input.productId === "eurusd");
  if (legacyFx?.productId !== "eurusd" ||
    legacyFx.canonical.availability !== "available") {
    throw new Error("Expected available legacy FX fixture.");
  }
  const legacyProjection = projectFiveProductFreeLiteV1({
    productId: "eurusd",
    canonical: {
      ...legacyFx.canonical,
      provenance: {
        ...legacyFx.canonical.provenance,
        observationTimestamp: undefined,
        originalPublisher: undefined,
        substitution: undefined,
      },
    },
  }, ASSESSED_AT);
  assertAvailable(legacyProjection, "legacy cached FX projection");
  assertEqual(legacyProjection.provenance.observationTimestamp,
    legacyProjection.sourceTimestamp, "legacy reference timestamp remains usable");
  assertEqual(legacyProjection.provenance.originalPublisher, "European Central Bank",
    "verified ECB publisher remains identifiable during cache rollover");
  assertEqual(legacyProjection.provenance.substitution.status, "unknown",
    "legacy cache does not invent a no-substitution claim");

  const fxUnavailable = Object.freeze({
    productId: "eurusd",
    canonical: Object.freeze({
      availability: "unavailable",
      reason: "Canonical FX unavailable.",
      missing: Object.freeze(["history"]),
    }),
  } satisfies FiveProductCanonicalProjectionInputV1);
  const estrUnavailable = Object.freeze({
    productId: "estr",
    canonical: Object.freeze({
      availability: "unavailable",
      reason: "Canonical rate unavailable.",
      missing: Object.freeze(["source"] as const),
    }),
  } satisfies FiveProductCanonicalProjectionInputV1);

  for (const unavailableInput of [fxUnavailable, estrUnavailable]) {
    for (const projection of [
      projectFiveProductFreeLiteV1(unavailableInput, ASSESSED_AT),
      projectFiveProductVipDeepV1(unavailableInput, ASSESSED_AT),
    ]) {
      assertEqual(projection.availability, "unavailable",
        `${unavailableInput.productId} unavailable fails closed`);
      if (projection.availability !== "unavailable") {
        throw new Error("Expected unavailable projection.");
      }
      assertEqual("currentValue" in projection, false,
        `${unavailableInput.productId} unavailable fabricates no value`);
      assertEqual("details" in projection, false,
        `${unavailableInput.productId} unavailable fabricates no state`);
      assertDeepEqual(projection.missing, unavailableInput.canonical.missing,
        `${unavailableInput.productId} missing reason preserved`);
    }
  }

  const estrInput = inputs.find((input) => input.productId === "estr");
  if (estrInput?.productId !== "estr" ||
    estrInput.canonical.availability !== "available") {
    throw new Error("Expected available \u20acSTR canonical input.");
  }

  for (const direction of [
    "rising-rate",
    "falling-rate",
    "range-bound",
  ] as const) {
    const canonical = estrWithDirection(estrInput.canonical, direction);
    const input = Object.freeze({
      productId: "estr",
      canonical,
    } satisfies FiveProductCanonicalProjectionInputV1);
    const free = projectFiveProductFreeLiteV1(input, ASSESSED_AT);
    const vip = projectFiveProductVipDeepV1(input, ASSESSED_AT);

    assertAvailable(free, `${direction} Free rate projection`);
    assertAvailable(vip, `${direction} VIP rate projection`);
    assertEqual(free.details.kind, "rate", `${direction} Free rate kind`);
    assertEqual(vip.details.kind, "rate", `${direction} VIP rate kind`);
    if (free.details.kind === "rate" && vip.details.kind === "rate") {
      assertEqual(free.details.direction, direction,
        `${direction} preserved in Free`);
      assertEqual(vip.details.direction, direction,
        `${direction} preserved in VIP`);
      assertEqual(vip.details.signal.direction, direction,
        `${direction} preserved in deep Signal`);
    }
    assertNoEstrSemanticLeakage(free, `${direction} Free`);
    assertNoEstrSemanticLeakage(vip, `${direction} VIP`);
  }

  auditProjectionSources();

  console.log("PASS: versioned five-product Free Lite and VIP Deep projections");
}

void main();
