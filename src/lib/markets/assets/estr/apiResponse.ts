import {
  type EstrProductionRuntimeResultV1,
} from "./runtime";
import type { EstrRateEngineV3EvidenceV1 } from "./engineAdapter";
import type { EstrRateMarketStateDataV1 } from "./marketState";
import type { EstrRateRiskDataV1 } from "./risk";
import type { EstrRateSignalDataV1 } from "./signal";

type EstrRuntimeLoader = () => Promise<EstrProductionRuntimeResultV1>;

export interface EstrIntelligenceSourceResponseV1 {
  readonly provider: string;
  readonly source: string;
  readonly seriesId: string;
  readonly dataflow: "ECB/EST/1.0";
  readonly seriesKey: "B.EU000A2X2A25.WT";
  readonly interval: "1d";
  readonly status: "end_of_day";
  readonly unit: "percent";
  readonly seriesKind: "reference-rate";
}

export interface EstrIntelligenceAvailableResponseV1 {
  readonly availability: "available";
  readonly productId: "estr";
  readonly product: "€STR";
  readonly currentRatePercent: number;
  readonly latestReferenceDate: string;
  readonly fetchedAt: number;
  readonly sourceTimestamp: number;
  readonly source: EstrIntelligenceSourceResponseV1;
  readonly signal: Pick<
    EstrRateSignalDataV1,
    "score" | "direction" | "strength" | "coverage"
  >;
  readonly risk: Pick<
    EstrRateRiskDataV1,
    "score" | "level" | "coverage"
  >;
  readonly marketState: EstrRateMarketStateDataV1;
  readonly engineAdapter: EstrRateEngineV3EvidenceV1;
}

export interface EstrIntelligenceUnavailableResponseV1 {
  readonly availability: "unavailable";
  readonly productId: "estr";
  readonly product: "€STR";
  readonly reason: string;
  readonly missing: readonly string[];
}

export type EstrIntelligenceApiResponseV1 =
  | EstrIntelligenceAvailableResponseV1
  | EstrIntelligenceUnavailableResponseV1;

/** Builds the stable public response while keeping the runtime authoritative. */
export async function handleEstrIntelligenceGetV1(
  loadRuntime: EstrRuntimeLoader,
): Promise<Response> {
  try {
    const runtime = await loadRuntime();

    if (runtime.availability === "unavailable") {
      return Response.json({
        availability: "unavailable",
        productId: "estr",
        product: "€STR",
        reason: runtime.reason,
        missing: runtime.missing,
      } satisfies EstrIntelligenceUnavailableResponseV1, { status: 503 });
    }

    const data = runtime.data;
    const provenance = data.source.provenance;

    return Response.json({
      availability: "available",
      productId: data.productId,
      product: data.product,
      currentRatePercent: data.currentRatePercent,
      latestReferenceDate: data.latestReferenceDate,
      fetchedAt: data.fetchedAt,
      sourceTimestamp: data.sourceTimestamp,
      source: {
        provider: provenance.provider,
        source: provenance.source,
        seriesId: provenance.seriesId,
        dataflow: data.source.dataflow,
        seriesKey: data.source.seriesKey,
        interval: provenance.interval as "1d",
        status: provenance.status as "end_of_day",
        unit: provenance.unit as "percent",
        seriesKind: provenance.seriesKind as "reference-rate",
      },
      signal: {
        score: data.signal.data.score,
        direction: data.signal.data.direction,
        strength: data.signal.data.strength,
        coverage: data.signal.data.coverage,
      },
      risk: {
        score: data.risk.data.score,
        level: data.risk.data.level,
        coverage: data.risk.data.coverage,
      },
      marketState: data.marketState.data,
      engineAdapter: data.engineAdapter.data.engineEvidence,
    } satisfies EstrIntelligenceAvailableResponseV1);
  } catch {
    console.error(
      "[Chronoverse €STR Intelligence API] Unexpected runtime failure.",
    );

    return Response.json({
      availability: "unavailable",
      productId: "estr",
      product: "€STR",
      reason: "€STR production intelligence is temporarily unavailable.",
      missing: ["runtime"],
    } satisfies EstrIntelligenceUnavailableResponseV1, { status: 500 });
  }
}
