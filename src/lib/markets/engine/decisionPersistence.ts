import {
  assetRegistry,
  type MarketAssetId,
} from "../core/assets";
import {
  type EngineDecisionSectionV3,
  type EngineDecisionV3,
} from "./contracts";

export const DECISION_SNAPSHOT_SCHEMA_VERSION = 1 as const;
export const DECISION_ENGINE_RESULT_VERSION = "3" as const;

export type CanonicalPersistedDecision =
  | {
      readonly availability: "available";
      readonly data: EngineDecisionV3;
    }
  | {
      readonly availability: "partial";
      readonly data: EngineDecisionV3;
      readonly missing: readonly string[];
    };

export interface CanonicalDecisionSnapshot {
  readonly schemaVersion: typeof DECISION_SNAPSHOT_SCHEMA_VERSION;
  readonly engineResultVersion: typeof DECISION_ENGINE_RESULT_VERSION;
  readonly assetId: MarketAssetId;
  readonly computedAt: string;
  readonly decision: CanonicalPersistedDecision;
}

export interface BuildCanonicalDecisionSnapshotInput {
  readonly assetId: MarketAssetId;
  readonly computedAt: string;
  readonly decision: EngineDecisionSectionV3;
}

export type DecisionSnapshotTimeComparison =
  | "newer"
  | "same-time"
  | "older";

export type AdvanceDecisionSnapshotResult =
  | { readonly status: "initialized"; readonly previous: null }
  | {
      readonly status: "unchanged";
      readonly previous: CanonicalDecisionSnapshot;
    }
  | {
      readonly status: "advanced";
      readonly previous: CanonicalDecisionSnapshot;
    }
  | {
      readonly status: "stale";
      readonly previous: CanonicalDecisionSnapshot;
    };

export function buildDecisionSnapshotKey(
  assetId: MarketAssetId,
): string {
  return `chronoverse:decision:engine-v3:snapshot-v1:${assetId}`;
}

export function buildCanonicalDecisionSnapshot(
  input: BuildCanonicalDecisionSnapshotInput,
): CanonicalDecisionSnapshot {
  if (!isMarketAssetId(input.assetId)) {
    throw new Error("A canonical MarketAssetId is required.");
  }

  if (!isValidTimestamp(input.computedAt)) {
    throw new Error("computedAt must be a valid timestamp string.");
  }

  const decision = buildPersistedDecision(input.decision);

  return {
    schemaVersion: DECISION_SNAPSHOT_SCHEMA_VERSION,
    engineResultVersion: DECISION_ENGINE_RESULT_VERSION,
    assetId: input.assetId,
    computedAt: input.computedAt,
    decision,
  };
}

export function parseDecisionSnapshot(
  value: unknown,
): CanonicalDecisionSnapshot | null {
  try {
    if (!isRecord(value)) {
      return null;
    }

    if (
      value.schemaVersion !== DECISION_SNAPSHOT_SCHEMA_VERSION ||
      value.engineResultVersion !== DECISION_ENGINE_RESULT_VERSION ||
      !isMarketAssetId(value.assetId) ||
      !isValidTimestamp(value.computedAt)
    ) {
      return null;
    }

    const decision = parsePersistedDecision(value.decision);

    if (decision === null) {
      return null;
    }

    return {
      schemaVersion: DECISION_SNAPSHOT_SCHEMA_VERSION,
      engineResultVersion: DECISION_ENGINE_RESULT_VERSION,
      assetId: value.assetId,
      computedAt: value.computedAt,
      decision,
    };
  } catch {
    return null;
  }
}

export function areDecisionSnapshotsSemanticallyEqual(
  a: CanonicalDecisionSnapshot,
  b: CanonicalDecisionSnapshot,
): boolean {
  if (
    a.schemaVersion !== DECISION_SNAPSHOT_SCHEMA_VERSION ||
    b.schemaVersion !== DECISION_SNAPSHOT_SCHEMA_VERSION ||
    a.engineResultVersion !== DECISION_ENGINE_RESULT_VERSION ||
    b.engineResultVersion !== DECISION_ENGINE_RESULT_VERSION ||
    a.assetId !== b.assetId ||
    a.decision.availability !== b.decision.availability ||
    a.decision.data.score !== b.decision.data.score ||
    a.decision.data.stance !== b.decision.data.stance
  ) {
    return false;
  }

  if (
    a.decision.availability === "available" &&
    b.decision.availability === "available"
  ) {
    return true;
  }

  if (
    a.decision.availability !== "partial" ||
    b.decision.availability !== "partial"
  ) {
    return false;
  }

  const aMissing = normalizeMissing(a.decision.missing);
  const bMissing = normalizeMissing(b.decision.missing);

  return (
    aMissing !== null &&
    bMissing !== null &&
    arraysEqual(aMissing, bMissing)
  );
}

export function compareDecisionSnapshotTime(
  candidate: CanonicalDecisionSnapshot,
  stored: CanonicalDecisionSnapshot,
): DecisionSnapshotTimeComparison {
  const candidateTime = Date.parse(candidate.computedAt);
  const storedTime = Date.parse(stored.computedAt);

  return candidateTime > storedTime
    ? "newer"
    : candidateTime < storedTime
      ? "older"
      : "same-time";
}

function buildPersistedDecision(
  decision: EngineDecisionSectionV3,
): CanonicalPersistedDecision {
  if (
    decision.availability !== "available" &&
    decision.availability !== "partial"
  ) {
    throw new Error("Only available or partial Decisions can be persisted.");
  }

  if (!isValidDecision(decision.data)) {
    throw new Error(
      "Decision score must be finite, normalized to -1..1, and match its stance.",
    );
  }

  if (decision.availability === "available") {
    return {
      availability: "available",
      data: {
        score: decision.data.score,
        stance: decision.data.stance,
      },
    };
  }

  const missing = normalizeMissing(decision.missing);

  if (missing === null || missing.length === 0) {
    throw new Error("A partial Decision requires at least one valid missing value.");
  }

  return {
    availability: "partial",
    data: {
      score: decision.data.score,
      stance: decision.data.stance,
    },
    missing,
  };
}

function parsePersistedDecision(
  value: unknown,
): CanonicalPersistedDecision | null {
  if (!isRecord(value) || !isRecord(value.data)) {
    return null;
  }

  const data = {
    score: value.data.score,
    stance: value.data.stance,
  };

  if (!isValidDecision(data)) {
    return null;
  }

  if (value.availability === "available") {
    return {
      availability: "available",
      data,
    };
  }

  if (value.availability !== "partial") {
    return null;
  }

  const missing = normalizeMissing(value.missing);

  if (missing === null || missing.length === 0) {
    return null;
  }

  return {
    availability: "partial",
    data,
    missing,
  };
}

function isValidDecision(value: unknown): value is EngineDecisionV3 {
  if (!isRecord(value)) {
    return false;
  }

  const score = value.score;
  const stance = value.stance;

  return (
    typeof score === "number" &&
    Number.isFinite(score) &&
    score >= -1 &&
    score <= 1 &&
    ((score > 0 && stance === "bullish") ||
      (score < 0 && stance === "bearish") ||
      (score === 0 && stance === "neutral"))
  );
}

function normalizeMissing(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return null;
  }

  return [...new Set(value.map((item) => item.trim()).filter(Boolean))].sort();
}

function isMarketAssetId(value: unknown): value is MarketAssetId {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(assetRegistry, value)
  );
}

function isValidTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function arraysEqual(
  a: readonly string[],
  b: readonly string[],
): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
