import { assertBoeBankRateServerV1 } from "../providers/boe/transport";
import { getBoeBankRateSpecV1, readBoeBankRateFactV1, buildBoeBankRateEvidenceV1,
  type BoeBankRateEvidenceV1 } from "../providers/boe/canonical";
import { normalizeCanonicalStatisticalSeriesV1, type CanonicalStatisticalSeriesInputV1 } from "../services/canonicalObservationSeries";
import { buildCanonicalStatisticalSeriesSnapshotV1, type CanonicalStatisticalSeriesSnapshotV1 } from "../services/canonicalStatisticalSeriesMemory";
import {
  CanonicalStatisticalSeriesVintagePersistenceError, createCanonicalStatisticalSeriesVintageRedisAdapterV1,
  type CanonicalStatisticalSeriesVintageRedisDependencies, type CanonicalStatisticalSeriesVintagePersistenceErrorCode,
  type CanonicalStatisticalVintageBindingV1, type AppendCanonicalStatisticalSeriesVintageRedisResultV1,
  type ReadCanonicalStatisticalSeriesVintageRedisResultV1,
} from "./canonicalStatisticalSeriesVintageRedis";

export class BoeBankRateVintagePersistenceError extends CanonicalStatisticalSeriesVintagePersistenceError {
  constructor(code: CanonicalStatisticalSeriesVintagePersistenceErrorCode) {
    super(code, `BoE policy vintage persistence failed: ${code}.`);
    this.name = "BoeBankRateVintagePersistenceError";
  }
}

export function buildBoeBankRateVintageKeyV1(publicationDate: string): string {
  return `chronoverse:markets:boe:evidence-vintages-v1:${getBoeBankRateSpecV1(publicationDate).canonicalSeriesId}`;
}

const STORAGE_ANNOTATION = "boe-bank-rate-evidence-record-v1";
const storageId = (date: string) => `uk-boe-bank-rate-evidence-record:${date}`;

/** Private CAS transport: value counts one evidence record; it NEVER carries a policy rate. */
function encode(date: string, evidence: BoeBankRateEvidenceV1) {
  const fact = readBoeBankRateFactV1(date, evidence);
  return normalizeCanonicalStatisticalSeriesV1({
    observations: [{ referencePeriod: date, value: 1, officialStatus: JSON.stringify([STORAGE_ANNOTATION, fact]) }],
    metadata: { ...evidence.metadata, canonicalSeriesId: storageId(date),
      sourceSeriesId: `BOE:policy-evidence-record:${date}`, unit: "source-evidence-record" },
  });
}

function decode(date: string, snapshot: CanonicalStatisticalSeriesSnapshotV1): BoeBankRateEvidenceV1 {
  const observation = snapshot.series.observations[0];
  if (snapshot.series.observations.length !== 1 || observation === undefined || typeof observation.officialStatus !== "string") {
    throw new BoeBankRateVintagePersistenceError("stored-snapshot-invalid");
  }
  const annotation: unknown = JSON.parse(observation.officialStatus);
  if (!Array.isArray(annotation) || annotation.length !== 2 || annotation[0] !== STORAGE_ANNOTATION) {
    throw new BoeBankRateVintagePersistenceError("stored-snapshot-invalid");
  }
  const evidence = buildBoeBankRateEvidenceV1(annotation[1], snapshot.series.metadata.fetchedAt);
  if (evidence.fact.publicationDate !== date || snapshot.knownAt !== evidence.metadata.fetchedAt ||
      snapshot.canonicalSeriesId !== storageId(date) || snapshot.sourceVersionId !== evidence.metadata.sourceVersionId ||
      JSON.stringify(snapshot.series) !== JSON.stringify(encode(date, evidence))) {
    throw new BoeBankRateVintagePersistenceError("stored-snapshot-invalid");
  }
  return evidence;
}

function valid(date: string, snapshot: CanonicalStatisticalSeriesSnapshotV1): boolean {
  try { decode(date, snapshot); return true; } catch { return false; }
}

const binding: CanonicalStatisticalVintageBindingV1 = {
  buildKey: buildBoeBankRateVintageKeyV1,
  canonicalSeriesId: storageId,
  validateCandidate: (date, series) => {
    const snapshot = buildCanonicalStatisticalSeriesSnapshotV1(series);
    if (!valid(date, snapshot)) throw new BoeBankRateVintagePersistenceError("invalid-current");
    return snapshot;
  },
  isValidSnapshot: valid,
  error: (code) => new BoeBankRateVintagePersistenceError(code),
};

export interface BoeBankRateEvidenceSnapshotV1 {
  readonly schemaVersion: "boe-bank-rate-evidence-snapshot-v1";
  readonly canonicalSeriesId: string;
  readonly knownAt: number;
  readonly sourceVersionId: string;
  readonly evidence: BoeBankRateEvidenceV1;
}

type EvidenceResult<T> = T extends object ? {
  readonly [K in keyof T]: T[K] extends CanonicalStatisticalSeriesSnapshotV1 ? BoeBankRateEvidenceSnapshotV1 : T[K];
} : never;
export type BoeBankRateAppendResultV1 = EvidenceResult<AppendCanonicalStatisticalSeriesVintageRedisResultV1>;
export type BoeBankRateAsKnownReadResultV1 =
  | EvidenceResult<Exclude<ReadCanonicalStatisticalSeriesVintageRedisResultV1, { readonly status: "absent" }>>
  | { readonly status: "no-captured-evidence" | "not-known-as-of" };

function expose(date: string, snapshot: CanonicalStatisticalSeriesSnapshotV1): BoeBankRateEvidenceSnapshotV1 {
  const evidence = decode(date, snapshot);
  return Object.freeze({ schemaVersion: "boe-bank-rate-evidence-snapshot-v1", evidence,
    canonicalSeriesId: evidence.metadata.canonicalSeriesId, knownAt: snapshot.knownAt,
    sourceVersionId: evidence.metadata.sourceVersionId });
}

function exposeAppend(date: string, result: AppendCanonicalStatisticalSeriesVintageRedisResultV1): BoeBankRateAppendResultV1 {
  switch (result.status) {
    case "initialized": return { status: result.status, snapshot: expose(date, result.snapshot) };
    case "advanced": return { status: result.status, previous: expose(date, result.previous), snapshot: expose(date, result.snapshot) };
    case "unchanged": return { status: result.status, latest: expose(date, result.latest) };
    case "stale": case "conflict": return { status: result.status, latest: expose(date, result.latest), candidate: expose(date, result.candidate) };
  }
}

export interface BoeBankRateVintageAdapterV1 {
  readonly append: (publicationDate: string, evidence: BoeBankRateEvidenceV1) => Promise<BoeBankRateAppendResultV1>;
  /** Only structured captured evidence; private CAS carriers never cross this boundary. */
  readonly readAsKnownAt: (publicationDate: string, asOf: number) => Promise<BoeBankRateAsKnownReadResultV1>;
}

/** Required injected storage; no production instance or environment/provider wiring. */
export function createBoeBankRateVintageAdapterV1(dependencies: CanonicalStatisticalSeriesVintageRedisDependencies): BoeBankRateVintageAdapterV1 {
  assertBoeBankRateServerV1();
  async function run<T>(operation: (adapter: ReturnType<typeof createCanonicalStatisticalSeriesVintageRedisAdapterV1>) => Promise<T>): Promise<T> {
    assertBoeBankRateServerV1();
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
    append: (date: string, evidence: BoeBankRateEvidenceV1) => run(async (adapter) => {
      let series: CanonicalStatisticalSeriesInputV1;
      try { series = encode(date, evidence); }
      catch { throw new BoeBankRateVintagePersistenceError("invalid-current"); }
      return exposeAppend(date, await adapter.append(date, series));
    }),
    readAsKnownAt: (date: string, asOf: number): Promise<BoeBankRateAsKnownReadResultV1> => run(async (adapter) => {
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
