import type { MarketAssetId } from "../../core/assets";
import {
  areDecisionSnapshotsSemanticallyEqual,
  buildCanonicalDecisionSnapshot,
  compareDecisionSnapshotTime,
  parseDecisionSnapshot,
  type CanonicalDecisionSnapshot,
} from "../../engine/decisionPersistence";
import {
  DecisionSnapshotPersistenceError,
  createDecisionSnapshotRedisAdapter,
  type DecisionSnapshotRedisEval,
} from "../../persistence/decisionSnapshotRedis";

const EARLIER = "2026-01-01T00:00:00.000Z";
const LATER = "2026-01-02T00:00:00.000Z";

function snapshot(
  score: number,
  stance: "bullish" | "bearish" | "neutral",
  computedAt: string,
  missing?: readonly string[],
  assetId: MarketAssetId = "gold",
): CanonicalDecisionSnapshot {
  return buildCanonicalDecisionSnapshot({
    assetId,
    computedAt,
    decision: missing
      ? {
          availability: "partial",
          data: { score, stance },
          missing,
        }
      : {
          availability: "available",
          data: { score, stance },
        },
  });
}

function createFakeRedis(initial?: string) {
  const values = new Map<string, string>();
  let calls = 0;

  if (initial !== undefined) {
    values.set("chronoverse:decision:engine-v3:snapshot-v1:gold", initial);
  }

  const evaluate: DecisionSnapshotRedisEval = async (_script, keys, args) => {
    calls += 1;
    const key = keys[0];
    const candidateRaw = args[0];
    const storedRaw = values.get(key);
    const candidate = parseSerialized(candidateRaw);

    if (candidate === null) {
      return ["invalid-candidate", ""];
    }

    if (storedRaw === undefined) {
      values.set(key, candidateRaw);
      return ["initialized", ""];
    }

    const stored = parseSerialized(storedRaw);

    if (stored === null || stored.assetId !== candidate.assetId) {
      values.set(key, candidateRaw);
      return ["initialized", ""];
    }

    const time = compareDecisionSnapshotTime(candidate, stored);
    const equal = areDecisionSnapshotsSemanticallyEqual(candidate, stored);

    if (time === "older") {
      return ["stale", storedRaw];
    }

    if (time === "same-time") {
      return [equal ? "unchanged" : "stale", storedRaw];
    }

    if (equal) {
      return ["unchanged", storedRaw];
    }

    values.set(key, candidateRaw);
    return ["advanced", storedRaw];
  };

  return {
    advance: createDecisionSnapshotRedisAdapter(evaluate),
    calls: () => calls,
    stored: (assetId: MarketAssetId = "gold") =>
      values.get(`chronoverse:decision:engine-v3:snapshot-v1:${assetId}`),
  };
}

function parseSerialized(value: string): CanonicalDecisionSnapshot | null {
  try {
    return parseDecisionSnapshot(JSON.parse(value));
  } catch {
    return null;
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

async function main(): Promise<void> {
  const first = snapshot(0.4, "bullish", EARLIER);
  const changed = snapshot(-0.6, "bearish", LATER);

  const absent = createFakeRedis();
  const initialized = await absent.advance(first);
  assertEqual(initialized.status, "initialized", "absent initialization");
  assertEqual(initialized.previous, null, "absent previous");
  assertEqual(absent.calls(), 1, "one atomic initialization call");

  const advancing = createFakeRedis(JSON.stringify(first));
  const advanced = await advancing.advance(changed);
  assertEqual(advanced.status, "advanced", "newer changed status");
  assertEqual(advanced.previous?.decision.data.score, 0.4, "advanced previous");
  assertEqual(advancing.calls(), 1, "one atomic advance call");

  const equalNewer = createFakeRedis(JSON.stringify(first));
  const unchangedNewer = await equalNewer.advance(
    snapshot(0.4, "bullish", LATER),
  );
  assertEqual(unchangedNewer.status, "unchanged", "newer equal status");
  assertEqual(equalNewer.stored(), JSON.stringify(first), "newer equal avoids write");

  const newerStored = JSON.stringify(changed);
  const older = createFakeRedis(newerStored);
  const stale = await older.advance(first);
  assertEqual(stale.status, "stale", "older candidate status");
  assertEqual(older.stored(), newerStored, "older candidate avoids overwrite");

  const sameEqual = createFakeRedis(JSON.stringify(first));
  assertEqual(
    (await sameEqual.advance(first)).status,
    "unchanged",
    "same-time equal status",
  );

  const sameConflict = createFakeRedis(JSON.stringify(first));
  const conflict = await sameConflict.advance(
    snapshot(-0.2, "bearish", EARLIER),
  );
  assertEqual(conflict.status, "stale", "same-time conflict status");
  assertEqual(
    sameConflict.stored(),
    JSON.stringify(first),
    "same-time conflict avoids overwrite",
  );

  for (const [storedValue, label] of [
    [JSON.stringify({ schemaVersion: 0 }), "invalid payload"],
    ["{malformed", "malformed JSON"],
  ] as const) {
    const corrupt = createFakeRedis(storedValue);
    const recovered = await corrupt.advance(first);
    assertEqual(recovered.status, "initialized", `${label} recovery status`);
    assertEqual(recovered.previous, null, `${label} recovery previous`);
    assertEqual(
      parseSerialized(corrupt.stored() ?? "")?.decision.data.score,
      first.decision.data.score,
      `${label} replacement`,
    );
  }

  const partialPrevious = snapshot(
    0.3,
    "bullish",
    EARLIER,
    [" technical ", "macro", "macro"],
  );
  const partialRedis = createFakeRedis(JSON.stringify(partialPrevious));
  const partialResult = await partialRedis.advance(
    snapshot(0.5, "bullish", LATER, ["macro"]),
  );
  assertEqual(partialResult.status, "advanced", "partial advance status");
  assertEqual(
    partialResult.previous?.decision.availability,
    "partial",
    "partial previous availability",
  );

  const failingEval: DecisionSnapshotRedisEval = async () => {
    throw new Error("Redis unavailable");
  };
  const failingAdvance = createDecisionSnapshotRedisAdapter(failingEval);
  let failure: unknown = null;

  try {
    await failingAdvance(first);
  } catch (error) {
    failure = error;
  }

  assertEqual(
    failure instanceof DecisionSnapshotPersistenceError,
    true,
    "Redis failure boundary",
  );
  assertEqual(
    failure instanceof DecisionSnapshotPersistenceError
      ? failure.code
      : null,
    "redis-failure",
    "Redis failure classification",
  );

  console.log("PASS: Atomic Redis Decision Snapshot adapter");
}

void main();
