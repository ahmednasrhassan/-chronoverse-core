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
  ECB_GOVERNING_COUNCIL_CALENDAR_URL,
  normalizeEcbMonetaryPolicyEventV1,
} from "../../events/ecbMonetaryPolicy";
import { buildEcbMonetaryPolicyEventIntelligenceV1 } from
  "../../events/ecbMonetaryPolicyIntelligence";
import { buildEcbMonetaryPolicyEventSnapshotV1 } from
  "../../events/ecbMonetaryPolicyMemory";
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
  MarketProductVipEcbPolicyEventStateV1,
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
const ECB_EVENT = normalizeEcbMonetaryPolicyEventV1({
  canonicalMeetingDate: "2025-09-10",
  schedule: {
    meetingDate: "2025-09-10",
    fetchedAt: Date.parse("2025-09-10T10:00:00.000Z") / 1_000,
  },
  decision: {
    decisionDate: "2025-09-10",
    documentUrl:
      "https://www.ecb.europa.eu/press/pr/date/2025/html/ecb.mp250910~abcdef1234.en.html",
    contentDigest: "ab".repeat(32),
    fetchedAt: Date.parse("2025-09-10T11:30:00.000Z") / 1_000,
    firstObservedAt: Date.parse("2025-09-10T11:30:00.000Z") / 1_000,
    actualReleasedAt: "2025-09-10T11:00:00.000Z",
    rates: {
      depositFacility: 2,
      mainRefinancingOperations: 2.15,
      marginalLendingFacility: 2.4,
      effectiveDate: "2025-09-17",
    },
  },
});
const ECB_SNAPSHOT = buildEcbMonetaryPolicyEventSnapshotV1(ECB_EVENT);
const AVAILABLE_ECB_POLICY_EVENT = Object.freeze({
  status: "available",
  canonicalEventId: ECB_EVENT.canonicalEventId,
  canonicalMeetingDate: ECB_EVENT.canonicalMeetingDate,
  currentMeetingDate: ECB_EVENT.schedule.meetingDate,
  selectedSnapshotKnownAt: ECB_SNAPSHOT.knownAt,
  selectionState: "current-window",
  intelligence: buildEcbMonetaryPolicyEventIntelligenceV1({
    snapshot: ECB_SNAPSHOT,
    evaluatedAt: ASSESSED_AT,
  }),
  source: Object.freeze({
    sourceUrl: ECB_GOVERNING_COUNCIL_CALENDAR_URL,
    fetchedAt: ECB_EVENT.schedule.fetchedAt,
  }),
} as const satisfies MarketProductVipEcbPolicyEventStateV1);

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

const fixtureCalls = { acquisition: 0, evaluation: 0, persistence: 0 };

async function canonicalInputs(): Promise<
  readonly FiveProductCanonicalProjectionInputV1[]
> {
  const fxInputs = await Promise.all(FX_CONFIGURATIONS.map(async (configuration) => {
    fixtureCalls.evaluation++;
    return {
      productId: configuration.productId,
      canonical: await configuration.run({
        loadCanonicalSeries: async () => {
          fixtureCalls.acquisition++;
          return officialFxSeries(configuration.productId, configuration.baseValue);
        },
        now: () => new Date("2026-09-10T12:00:00.000Z"),
        advanceDecisionSnapshot: async () => {
          fixtureCalls.persistence++;
          return { status: "initialized", previous: null };
        },
      }),
    } satisfies FiveProductCanonicalProjectionInputV1;
  }));
  fixtureCalls.evaluation++;
  const estrCanonical = await getEstrProductionRuntimeV1({
    loadSource: async () => { fixtureCalls.acquisition++; return officialEstrSource(); },
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
    currentUse: projection.currentUse,
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


/** Deterministic delivery checks reuse one cached result; no runtime calls here. */
function verifyCurrentUse(inputs: readonly FiveProductCanonicalProjectionInputV1[]): void {
  const callsBefore = JSON.stringify(fixtureCalls);
  function withReference(input: FiveProductCanonicalProjectionInputV1, reference: string): FiveProductCanonicalProjectionInputV1 {
    const timestamp = Date.parse(`${reference}T00:00:00Z`) / 1_000;
    if (input.canonical.availability !== "available") throw new Error("Expected cached fixture");
    if (input.productId !== "estr") {
      return { ...input, canonical: { ...input.canonical, provenance: {
        ...input.canonical.provenance, observationTimestamp: timestamp, sourceTimestamp: timestamp,
      } } };
    }
    return { ...input, canonical: { ...input.canonical, data: {
      ...input.canonical.data, latestReferenceDate: reference, sourceTimestamp: timestamp,
      source: { ...input.canonical.data.source, provenance: {
        ...input.canonical.data.source.provenance, observationTimestamp: timestamp, sourceTimestamp: timestamp,
      } },
    } } };
  }
  function check(input: FiveProductCanonicalProjectionInputV1, at: string | undefined, expected: string): void {
    const before = JSON.stringify(input.canonical);
    const free = projectFiveProductFreeLiteV1(input, at);
    const vip = projectFiveProductVipDeepV1(input, AVAILABLE_ECB_POLICY_EVENT, at);
    assertEqual(free.currentUse.status, expected, `${input.productId} ${at} current use`);
    assertDeepEqual(free.currentUse, vip.currentUse, `${input.productId} Free/VIP validity`);
    assertEqual(JSON.stringify(input.canonical), before, "cached result is structurally unchanged");
    if (input.productId !== "estr" && input.canonical.availability === "available" &&
        vip.availability === "available" && vip.productKind === "fx") {
      for (const field of ["recommendation", "decision", "confidence", "evaluatedAt", "decisionLifecycle"] as const) {
        assertEqual(vip.details.engine[field], input.canonical.engineResult[field], `cached ${field} same reference/value`);
        assertEqual(JSON.stringify(vip.details.engine[field]), JSON.stringify(input.canonical.engineResult[field]), `cached ${field} byte equivalent`);
      }
      if (expected === "eligible") {
        assertEqual(vip.details.engine.decision.availability, input.canonical.engineResult.decision.availability,
          "eligible partial analysis keeps its analytical availability");
        assertEqual(vip.details.engine.decision.availability, "partial", "real launch fixture has partial decision");
      }
    }
  }
  for (const original of inputs) {
    const isRate = original.productId === "estr";
    const cached = withReference(original, isRate ? "2026-10-01" : "2026-10-02");
    // Acquisition instants are Unix seconds; Date's inclusive limit is 8.64e15 ms.
    const maxDateSeconds = 8_640_000_000_000;
    function withFetchedAt(fetchedAt: number | undefined, target: "both" | "provenance" | "data" = "both") {
      const input = JSON.parse(JSON.stringify(cached)) as FiveProductCanonicalProjectionInputV1;
      if (input.canonical.availability !== "available") throw new Error("Expected cached fixture");
      if (input.productId === "estr") {
        if (target !== "data") Object.assign(input.canonical.data.source.provenance, { fetchedAt });
        if (target !== "provenance") Object.assign(input.canonical.data, { fetchedAt });
      } else {
        Object.assign(input.canonical.provenance, { fetchedAt });
      }
      return input;
    }
    const acquisitionAssessedAt = "2026-10-05T00:00:00Z";
    for (const fetchedAt of [
      undefined, NaN, Infinity, -Infinity, 1e99, -1e99,
      maxDateSeconds + 1, -maxDateSeconds - 1,
    ]) {
      const invalid = withFetchedAt(fetchedAt);
      check(invalid, acquisitionAssessedAt, "unavailable");
      assertEqual(projectFiveProductFreeLiteV1(invalid, acquisitionAssessedAt).currentUse.reason,
        "canonical-result-unavailable", `${original.productId} invalid acquisition fails closed`);
      if (isRate) {
        // Both retained rate data and delivered provenance must independently qualify.
        const provenanceOnly = withFetchedAt(fetchedAt, "provenance");
        check(provenanceOnly, acquisitionAssessedAt, "unknown");
        assertEqual(projectFiveProductFreeLiteV1(provenanceOnly, acquisitionAssessedAt).currentUse.reason,
          "provenance-incomplete", "invalid rate acquisition provenance fails closed");
        check(withFetchedAt(fetchedAt, "data"), acquisitionAssessedAt, "unavailable");
      }
    }
    for (const fetchedAt of [
      -maxDateSeconds, -maxDateSeconds + 1, 0,
      Date.parse(acquisitionAssessedAt) / 1_000 + 0.125,
      maxDateSeconds - 1, maxDateSeconds,
    ]) {
      const valid = withFetchedAt(fetchedAt);
      check(valid, acquisitionAssessedAt, "eligible");
      for (const projection of [
        projectFiveProductFreeLiteV1(valid, acquisitionAssessedAt),
        projectFiveProductVipDeepV1(valid, AVAILABLE_ECB_POLICY_EVENT, acquisitionAssessedAt),
      ]) {
        assertAvailable(projection, "representable acquisition boundary");
        assertEqual(projection.fetchedAt, fetchedAt, `${original.productId} retains Unix seconds`);
      }
    }
    if (cached.productId !== "estr" && cached.canonical.availability === "available") {
      const engine = cached.canonical.engineResult;
      if (!("data" in engine.recommendation) || engine.marketData.availability === "unavailable") throw new Error("Expected usable recommendation fixture");
      // A previously fresh cached selective result reproduces the audited seam.
      const selective = { ...cached, canonical: { ...cached.canonical, engineResult: {
        ...engine, evaluatedAt: "2026-10-05T10:00:00Z",
        marketData: { ...engine.marketData, availability: "available" as const, freshness: "within-cadence" as const },
        recommendation: { ...engine.recommendation, data: { ...engine.recommendation.data, posture: "selective" as const } },
      } } };
      check(selective, "2026-10-05T13:59:00Z", "eligible");
      check(selective, "2026-10-05T15:00:00Z", "stale");
      const delivered = projectFiveProductVipDeepV1(selective, AVAILABLE_ECB_POLICY_EVENT, "2026-10-05T15:00:00Z");
      assertAvailable(delivered, "retained cached analysis");
      if (delivered.productKind !== "fx" || !("data" in delivered.details.engine.recommendation)) throw new Error("Expected FX recommendation");
      assertEqual(delivered.details.engine.recommendation.data.posture, "selective", "canonical selective posture not rewritten into WAIT");
      assertEqual(delivered.currentUse.status, "stale", "current presentation independently waits");
    }
    // Monday: existing Frankfurt windows are FX 16-17 and rate 08-09.
    check(cached, isRate ? "2026-10-05T05:59:00Z" : "2026-10-05T13:59:00Z", "eligible");
    check(cached, isRate ? "2026-10-05T06:00:00Z" : "2026-10-05T14:00:00Z", "unknown");
    check(cached, isRate ? "2026-10-05T07:00:00Z" : "2026-10-05T15:00:00Z", "stale");
    check(cached, "2026-10-04T18:00:00Z", "eligible"); // Weekend: no new TARGET publication.
    // Easter Monday: previous FX reference Thursday; rate reference Wednesday.
    check(withReference(original, isRate ? "2026-04-01" : "2026-04-02"), "2026-04-06T18:00:00Z", "eligible");
    // Match the existing calendar across the winter/summer clock boundary.
    for (const [reference, before, after] of isRate ? [
      ["2026-03-25", "2026-03-27T06:59:00Z", "2026-03-27T08:00:00Z"],
      ["2026-03-26", "2026-03-30T05:59:00Z", "2026-03-30T07:00:00Z"],
    ] : [
      ["2026-03-26", "2026-03-27T14:59:00Z", "2026-03-27T16:00:00Z"],
      ["2026-03-27", "2026-03-30T13:59:00Z", "2026-03-30T15:00:00Z"],
    ]) {
      const dst = withReference(original, reference!);
      check(dst, before, "eligible"); check(dst, after, "stale");
    }
    for (const invalid of [undefined, "", "invalid", "2026-10-05T12:00:00", "2026-02-30T12:00:00Z", "2026-10-05T24:00:00Z"]) {
      check(cached, invalid, "unknown");
      const result = projectFiveProductFreeLiteV1(cached, invalid);
      assertEqual(result.currentUse.assessedAt, null, "unsafe clock not serialized");
      assertEqual(result.currentUse.reason, "assessment-time-unavailable", "explicit clock reason");
    }
    const unavailable: FiveProductCanonicalProjectionInputV1 = original.productId === "estr"
      ? { productId: "estr", canonical: { availability: "unavailable", reason: "source unavailable", missing: ["source"] } }
      : { productId: original.productId, canonical: { availability: "unavailable", reason: "source unavailable" } };
    check(unavailable, "2026-10-05T12:00:00Z", "unavailable");
    check(unavailable, undefined, "unavailable");
    // Simulated malformed cache metadata must not become eligible via generic cadence fallback.
    const malformed = JSON.parse(JSON.stringify(cached)) as FiveProductCanonicalProjectionInputV1;
    if (malformed.canonical.availability !== "available") throw new Error("Expected fixture");
    const provenance = malformed.productId === "estr" ? malformed.canonical.data.source.provenance : malformed.canonical.provenance;
    Object.assign(provenance, { provider: "" });
    check(malformed, "2026-10-05T00:00:00Z", "unknown");
    assertEqual(projectFiveProductFreeLiteV1(malformed, "2026-10-05T00:00:00Z").currentUse.reason,
      "provenance-incomplete", "missing provenance reason");
    Object.assign(provenance, { provider: "ecb", observationTimestamp: NaN });
    check(malformed, "2026-10-05T00:00:00Z", "unknown");
    Object.assign(provenance, { observationTimestamp: provenance.sourceTimestamp, status: "unavailable" });
    check(malformed, "2026-10-05T12:00:00Z", "unavailable");
    check(malformed, undefined, "unavailable");
    Object.assign(provenance, { status: "end_of_day", fetchedAt: undefined });
    check(malformed, "2026-10-05T00:00:00Z", isRate ? "unknown" : "unavailable");
    const absent = JSON.parse(JSON.stringify(cached)) as FiveProductCanonicalProjectionInputV1;
    if (absent.canonical.availability !== "available") throw new Error("Expected fixture");
    if (absent.productId === "estr") Object.assign(absent.canonical.data.source, { provenance: undefined });
    else Object.assign(absent.canonical, { provenance: undefined });
    check(absent, "2026-10-05T12:00:00Z", "unavailable");
    check(withReference(original, "2026-10-06"), "2026-10-05T12:00:00Z", "unknown");
  }
  assertEqual(JSON.stringify(fixtureCalls), callsBefore, "delivery checks cause no acquisition, calculation or persistence");
}

async function main(): Promise<void> {
  const inputs = await canonicalInputs();
  assertEqual(inputs.length, 5, "exactly five launch products");
  verifyCurrentUse(inputs);

  for (const input of inputs) {
    const before = JSON.stringify(input.canonical);
    const free = projectFiveProductFreeLiteV1(input, ASSESSED_AT);
    const vip = projectFiveProductVipDeepV1(
      input,
      AVAILABLE_ECB_POLICY_EVENT,
      ASSESSED_AT,
    );

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
    assertEqual("ecbPolicyEvent" in free.details, false,
      `${input.productId} Free excludes ECB event context`);
    assertEqual(vip.details.ecbPolicyEvent.status, "available",
      `${input.productId} Deep includes ECB event context`);
    assertEqual(vip.details.ecbPolicyEvent.relevance,
      input.productId === "estr"
        ? "direct-euro-rate-policy-context"
        : "euro-policy-context",
    `${input.productId} has factual event relevance`);
    if (vip.details.ecbPolicyEvent.status !== "available") {
      throw new Error("Expected available ECB event fixture.");
    }
    assertEqual(vip.details.ecbPolicyEvent.canonicalEventId,
      AVAILABLE_ECB_POLICY_EVENT.canonicalEventId,
    `${input.productId} preserves canonical event identity`);
    assertEqual(vip.details.ecbPolicyEvent.selectedSnapshotKnownAt,
      AVAILABLE_ECB_POLICY_EVENT.selectedSnapshotKnownAt,
    `${input.productId} preserves selected knownAt`);
    assertEqual(vip.details.ecbPolicyEvent.intelligence,
      AVAILABLE_ECB_POLICY_EVENT.intelligence,
    `${input.productId} preserves intelligence without reconstruction`);
    assertEqual(vip.details.ecbPolicyEvent.intelligence.phase,
      AVAILABLE_ECB_POLICY_EVENT.intelligence.phase,
    `${input.productId} preserves lifecycle phase`);
    assertEqual(vip.details.ecbPolicyEvent.intelligence.decisionEvidence,
      AVAILABLE_ECB_POLICY_EVENT.intelligence.decisionEvidence,
    `${input.productId} preserves Decision evidence`);
    assertEqual(vip.details.ecbPolicyEvent.intelligence.releaseTiming,
      AVAILABLE_ECB_POLICY_EVENT.intelligence.releaseTiming,
    `${input.productId} preserves release timing`);
    assertEqual(vip.details.ecbPolicyEvent.intelligence.rateFacts,
      AVAILABLE_ECB_POLICY_EVENT.intelligence.rateFacts,
    `${input.productId} preserves rate facts`);
    assertDeepEqual(vip.details.ecbPolicyEvent.source,
      AVAILABLE_ECB_POLICY_EVENT.source,
    `${input.productId} preserves event source provenance`);
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
    assertDeepEqual(projectFiveProductVipDeepV1(
      input,
      AVAILABLE_ECB_POLICY_EVENT,
      ASSESSED_AT,
    ), vip,
      `${input.productId} repeated VIP projection deterministic`);

    if (input.productId === "estr") {
      assertEqual(free.details.kind, "rate", "\u20acSTR Free rate details");
      assertEqual(vip.details.kind, "rate", "\u20acSTR VIP rate details");
      if (free.details.kind !== "rate" || vip.details.kind !== "rate" ||
        input.canonical.availability !== "available") {
        throw new Error("Expected available rate projection fixtures.");
      }

      const state = input.canonical.data.marketState.data;
      assertEqual(input.canonical.data.latestReferenceDate, "2025-08-08",
        "rate fixture ends on a Friday reference date");
      const beforePublication = projectFiveProductFreeLiteV1(
        input, "2025-08-12T00:00:00.000Z",
      );
      assertAvailable(beforePublication, "Tuesday pre-publication rate projection");
      assertEqual(beforePublication.provenance.freshness, "within-cadence",
        "Friday rate reference remains current before Tuesday publication");
      const publicationWindow = projectFiveProductVipDeepV1(
        input, AVAILABLE_ECB_POLICY_EVENT, "2025-08-12T06:00:00.000Z",
      );
      assertAvailable(publicationWindow, "Tuesday publication-time rate projection");
      assertEqual(publicationWindow.provenance.freshness, "unknown",
        "Friday rate reference is uncertain during the publication window");
      const afterPublication = projectFiveProductVipDeepV1(
        input, AVAILABLE_ECB_POLICY_EVENT, "2025-08-12T07:00:00.000Z",
      );
      assertAvailable(afterPublication, "Tuesday post-publication rate projection");
      assertEqual(afterPublication.provenance.freshness, "stale",
        "Friday rate reference becomes stale after 09:00 CEST");
      const boundaryAssessedAt = "2025-08-12T23:59:00.000Z";
      const boundaryFree = projectFiveProductFreeLiteV1(input, boundaryAssessedAt);
      const boundaryVip = projectFiveProductVipDeepV1(
        input,
        AVAILABLE_ECB_POLICY_EVENT,
        boundaryAssessedAt,
      );
      assertAvailable(boundaryFree, "Tuesday rate Free projection");
      assertAvailable(boundaryVip, "Tuesday rate VIP projection");
      assertEqual(boundaryFree.provenance.freshness, "stale",
        "Friday rate reference is stale Tuesday late in Free");
      assertEqual(boundaryVip.provenance.freshness, "stale",
        "Friday rate reference is stale Tuesday late in VIP");
      assertDeepEqual(commonTruth(boundaryFree), commonTruth(boundaryVip),
        "rate tiers share corrected boundary freshness");
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
        republished, AVAILABLE_ECB_POLICY_EVENT, ASSESSED_AT,
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
  const recentlyFetched = projectFiveProductFreeLiteV1({
    productId: "eurusd",
    canonical: {
      ...legacyFx.canonical,
      provenance: {
        ...legacyFx.canonical.provenance,
        fetchedAt: Date.parse(ASSESSED_AT) / 1_000,
      },
    },
  }, ASSESSED_AT);
  assertAvailable(recentlyFetched, "recently fetched old FX reference");
  assertEqual(recentlyFetched.provenance.freshness, "stale",
    "recent cache fetch cannot refresh an old observation");

  const degradedEventStates = Object.freeze([
    Object.freeze({
      status: "source-unavailable",
      sourceUrl: ECB_GOVERNING_COUNCIL_CALENDAR_URL,
      reason: "request-failed",
    }),
    Object.freeze({
      status: "reconciliation-required",
      reason: "active-date-missing",
      canonicalEventId: AVAILABLE_ECB_POLICY_EVENT.canonicalEventId,
      currentMeetingDate: AVAILABLE_ECB_POLICY_EVENT.currentMeetingDate,
    }),
    Object.freeze({
      status: "stored-state-invalid",
      owner: "event-memory",
    }),
    Object.freeze({
      status: "insufficient-as-known-state",
      canonicalEventId: AVAILABLE_ECB_POLICY_EVENT.canonicalEventId,
      evaluatedAt: ASSESSED_AT,
    }),
  ] as const satisfies readonly MarketProductVipEcbPolicyEventStateV1[]);
  const availableEventProjection = projectFiveProductVipDeepV1(
    legacyFx,
    AVAILABLE_ECB_POLICY_EVENT,
    ASSESSED_AT,
  );
  assertAvailable(availableEventProjection, "available event Deep baseline");
  if (availableEventProjection.details.kind !== "fx") {
    throw new Error("Expected available FX Deep baseline.");
  }
  for (const eventState of degradedEventStates) {
    const projection = projectFiveProductVipDeepV1(
      legacyFx,
      eventState,
      ASSESSED_AT,
    );
    assertAvailable(projection, `${eventState.status} event degradation`);
    if (projection.details.kind !== "fx") {
      throw new Error("Expected degraded FX Deep projection.");
    }
    assertEqual(projection.details.ecbPolicyEvent.status, eventState.status,
      `${eventState.status} remains explicit`);
    assertDeepEqual(projection.details.engine, availableEventProjection.details.engine,
      `${eventState.status} does not mutate FX Engine output`);
    assertEqual(projection.details.direction,
      availableEventProjection.details.direction,
    `${eventState.status} does not mutate FX direction`);
  }

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
      projectFiveProductVipDeepV1(
        unavailableInput,
        AVAILABLE_ECB_POLICY_EVENT,
        ASSESSED_AT,
      ),
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
    const vip = projectFiveProductVipDeepV1(
      input,
      AVAILABLE_ECB_POLICY_EVENT,
      ASSESSED_AT,
    );

    assertAvailable(free, `${direction} Free rate projection`);
    assertAvailable(vip, `${direction} VIP rate projection`);
    if (direction === "range-bound") {
      assertEqual(free.availability, "available",
        "neutral rate analysis remains available");
      assertEqual(projectFiveProductFreeLiteV1(estrUnavailable, ASSESSED_AT).availability,
        "unavailable", "missing rate source remains unavailable");
    }
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
