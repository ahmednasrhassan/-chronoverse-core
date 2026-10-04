import { assertSnbPolicyServerV1 } from "../providers/snb/transport";
import { getSnbPolicySpecV1, readSnbPolicyFactV1, buildSnbPolicyEvidenceV1,
  type SnbPolicyEvidenceV1 } from "../providers/snb/canonical";
import { normalizeCanonicalStatisticalSeriesV1, type CanonicalStatisticalSeriesInputV1 } from "../services/canonicalObservationSeries";
import { buildCanonicalStatisticalSeriesSnapshotV1, type CanonicalStatisticalSeriesSnapshotV1 } from "../services/canonicalStatisticalSeriesMemory";
import {
  CanonicalStatisticalSeriesVintagePersistenceError, createCanonicalStatisticalSeriesVintageRedisAdapterV1,
  type CanonicalStatisticalSeriesVintageRedisDependencies, type CanonicalStatisticalSeriesVintagePersistenceErrorCode,
  type CanonicalStatisticalVintageBindingV1, type AppendCanonicalStatisticalSeriesVintageRedisResultV1,
  type ReadCanonicalStatisticalSeriesVintageRedisResultV1,
} from "./canonicalStatisticalSeriesVintageRedis";

export class SnbPolicyVintagePersistenceError extends CanonicalStatisticalSeriesVintagePersistenceError {
  constructor(code: CanonicalStatisticalSeriesVintagePersistenceErrorCode) {
    super(code, `SNB policy vintage persistence failed: ${code}.`);
    this.name = "SnbPolicyVintagePersistenceError";
  }
}

export function buildSnbPolicyVintageKeyV1(decisionDate: string): string {
  return `chronoverse:markets:snb:evidence-vintages-v1:${getSnbPolicySpecV1(decisionDate).canonicalSeriesId}`;
}

const STORAGE_ANNOTATION = "snb-policy-evidence-record-v1";
const storageId = (date: string) => `switzerland-snb-policy-evidence-record:${date}`;

/** Private CAS transport: value counts one evidence record; it NEVER carries a policy rate. */
function encode(date: string, evidence: SnbPolicyEvidenceV1) {
  const fact = readSnbPolicyFactV1(date, evidence);
  return normalizeCanonicalStatisticalSeriesV1({
    observations: [{ referencePeriod: date, value: 1, officialStatus: JSON.stringify([STORAGE_ANNOTATION, fact]) }],
    metadata: { ...evidence.metadata, canonicalSeriesId: storageId(date),
      sourceSeriesId: `SNB:policy-evidence-record:${date}`, unit: "source-evidence-record" },
  });
}

function decode(date: string, snapshot: CanonicalStatisticalSeriesSnapshotV1): SnbPolicyEvidenceV1 {
  const observation = snapshot.series.observations[0];
  if (snapshot.series.observations.length !== 1 || observation === undefined || typeof observation.officialStatus !== "string") {
    throw new SnbPolicyVintagePersistenceError("stored-snapshot-invalid");
  }
  const annotation: unknown = JSON.parse(observation.officialStatus);
  if (!Array.isArray(annotation) || annotation.length !== 2 || annotation[0] !== STORAGE_ANNOTATION) {
    throw new SnbPolicyVintagePersistenceError("stored-snapshot-invalid");
  }
  const evidence = buildSnbPolicyEvidenceV1(annotation[1], snapshot.series.metadata.fetchedAt);
  if (evidence.fact.decisionDate !== date || snapshot.knownAt !== evidence.metadata.fetchedAt ||
      snapshot.canonicalSeriesId !== storageId(date) || snapshot.sourceVersionId !== evidence.metadata.sourceVersionId ||
      JSON.stringify(snapshot.series) !== JSON.stringify(encode(date, evidence))) {
    throw new SnbPolicyVintagePersistenceError("stored-snapshot-invalid");
  }
  return evidence;
}

function valid(date: string, snapshot: CanonicalStatisticalSeriesSnapshotV1): boolean {
  try { decode(date, snapshot); return true; } catch { return false; }
}

const binding: CanonicalStatisticalVintageBindingV1 = {
  buildKey: buildSnbPolicyVintageKeyV1,
  canonicalSeriesId: storageId,
  validateCandidate: (date, series) => {
    const snapshot = buildCanonicalStatisticalSeriesSnapshotV1(series);
    if (!valid(date, snapshot)) throw new SnbPolicyVintagePersistenceError("invalid-current");
    return snapshot;
  },
  isValidSnapshot: valid,
  error: (code) => new SnbPolicyVintagePersistenceError(code),
};

export interface SnbPolicyEvidenceSnapshotV1 {
  readonly schemaVersion: "snb-policy-evidence-snapshot-v1";
  readonly canonicalSeriesId: string;
  readonly knownAt: number;
  readonly sourceVersionId: string;
  readonly evidence: SnbPolicyEvidenceV1;
}

type EvidenceResult<T> = T extends object ? {
  readonly [K in keyof T]: T[K] extends CanonicalStatisticalSeriesSnapshotV1 ? SnbPolicyEvidenceSnapshotV1 : T[K];
} : never;
export type SnbPolicyAppendResultV1 = EvidenceResult<AppendCanonicalStatisticalSeriesVintageRedisResultV1>;
export type SnbPolicyAsKnownReadResultV1 =
  | EvidenceResult<Exclude<ReadCanonicalStatisticalSeriesVintageRedisResultV1, { readonly status: "absent" }>>
  | { readonly status: "no-captured-evidence" | "not-known-as-of" };

function expose(date: string, snapshot: CanonicalStatisticalSeriesSnapshotV1): SnbPolicyEvidenceSnapshotV1 {
  const evidence = decode(date, snapshot);
  return Object.freeze({ schemaVersion: "snb-policy-evidence-snapshot-v1", evidence,
    canonicalSeriesId: evidence.metadata.canonicalSeriesId, knownAt: snapshot.knownAt,
    sourceVersionId: evidence.metadata.sourceVersionId });
}

function exposeAppend(date: string, result: AppendCanonicalStatisticalSeriesVintageRedisResultV1): SnbPolicyAppendResultV1 {
  switch (result.status) {
    case "initialized": return { status: result.status, snapshot: expose(date, result.snapshot) };
    case "advanced": return { status: result.status, previous: expose(date, result.previous), snapshot: expose(date, result.snapshot) };
    case "unchanged": return { status: result.status, latest: expose(date, result.latest) };
    case "stale": case "conflict": return { status: result.status, latest: expose(date, result.latest), candidate: expose(date, result.candidate) };
  }
}

export interface SnbPolicyVintageAdapterV1 {
  readonly append: (decisionDate: string, evidence: SnbPolicyEvidenceV1) => Promise<SnbPolicyAppendResultV1>;
  /** Only structured captured evidence; private CAS carriers never cross this boundary. */
  readonly readAsKnownAt: (decisionDate: string, asOf: number) => Promise<SnbPolicyAsKnownReadResultV1>;
}

/** Required injected storage; no production instance or environment/provider wiring. */
export function createSnbPolicyVintageAdapterV1(dependencies: CanonicalStatisticalSeriesVintageRedisDependencies): SnbPolicyVintageAdapterV1 {
  assertSnbPolicyServerV1();
  async function run<T>(operation: (adapter: ReturnType<typeof createCanonicalStatisticalSeriesVintageRedisAdapterV1>) => Promise<T>): Promise<T> {
    assertSnbPolicyServerV1();
    // Preserve programming defects across the shared engine's storage classification boundary.
    let defect: TypeError | ReferenceError | undefined;
    const capture = async (operation: () => Promise<unknown>) => {
      try { return await operation(); }
      catch (error) {
        if (error instanceof TypeError || error instanceof ReferenceError) defect = error;
        throw error;
      }
    };
    const adapter = createCanonicalStatisticalSeriesVintageRedisAdapterV1(binding, {
      readHead: (key) => capture(() => dependencies.readHead(key)),
      readAsKnownAt: (key, asOf) => capture(() => dependencies.readAsKnownAt(key, asOf)),
      compareAndAppend: (key, expected, score, member) => capture(() => dependencies.compareAndAppend(key, expected, score, member)),
    });
    try {
      const result = await operation(adapter);
      if (defect !== undefined) throw defect;
      return result;
    } catch (error) { throw defect ?? error; }
  }
  return Object.freeze({
    append: (date: string, evidence: SnbPolicyEvidenceV1) => run(async (adapter) => {
      let series: CanonicalStatisticalSeriesInputV1;
      try { series = encode(date, evidence); }
      catch { throw new SnbPolicyVintagePersistenceError("invalid-current"); }
      return exposeAppend(date, await adapter.append(date, series));
    }),
    readAsKnownAt: (date: string, asOf: number): Promise<SnbPolicyAsKnownReadResultV1> => run(async (adapter) => {
      const selected = await adapter.readAsKnownAt(date, asOf);
      if (selected.status === "available") return { status: selected.status, snapshot: expose(date, selected.snapshot) };
      if (selected.status !== "absent") return selected;
      // Probe captured coverage only; never expose a later snapshot at an earlier boundary.
      const coverage = await adapter.readAsKnownAt(date, Number.MAX_SAFE_INTEGER);
      if (coverage.status === "absent") return { status: "no-captured-evidence" };
      if (coverage.status === "available") return { status: "not-known-as-of" };
      return coverage;
    }),
  });
}
