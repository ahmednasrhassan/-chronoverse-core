import { Redis } from "@upstash/redis";
import type { CanonicalStatisticalSeriesInputV1 } from "../services/canonicalObservationSeries";
import {
  CANONICAL_STATISTICAL_SERIES_MEMORY_SCHEMA_VERSION_V1,
  parseCanonicalStatisticalSeriesMemoryV1,
  type CanonicalStatisticalSeriesSnapshotV1,
} from "../services/canonicalStatisticalSeriesMemory";

export type CanonicalStatisticalSeriesVintageRedisReadHead = (
  key: string,
) => Promise<unknown>;

export type CanonicalStatisticalSeriesVintageRedisReadAsKnownAt = (
  key: string,
  asOf: number,
) => Promise<unknown>;

export interface CanonicalStatisticalSeriesVintageRedisExpectedHeadV1 {
  readonly score: number;
  readonly member: string;
}

export type CanonicalStatisticalSeriesVintageRedisCompareAndAppend = (
  key: string,
  expectedHead: CanonicalStatisticalSeriesVintageRedisExpectedHeadV1 | null,
  candidateScore: number,
  candidateMember: string,
) => Promise<unknown>;

export type CanonicalStatisticalSeriesVintagePersistenceErrorCode =
  | "invalid-current"
  | "stored-snapshot-invalid"
  | "duplicate-score"
  | "redis-failure"
  | "invalid-response"
  | "concurrency-conflict";

export class CanonicalStatisticalSeriesVintagePersistenceError extends Error {
  readonly code: CanonicalStatisticalSeriesVintagePersistenceErrorCode;

  constructor(
    code: CanonicalStatisticalSeriesVintagePersistenceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CanonicalStatisticalSeriesVintagePersistenceError";
    this.code = code;
  }
}

export type AppendCanonicalStatisticalSeriesVintageRedisResultV1 =
  | {
      readonly status: "initialized";
      readonly snapshot: CanonicalStatisticalSeriesSnapshotV1;
    }
  | {
      readonly status: "advanced";
      readonly previous: CanonicalStatisticalSeriesSnapshotV1;
      readonly snapshot: CanonicalStatisticalSeriesSnapshotV1;
    }
  | {
      readonly status: "unchanged";
      readonly latest: CanonicalStatisticalSeriesSnapshotV1;
    }
  | {
      readonly status: "stale";
      readonly latest: CanonicalStatisticalSeriesSnapshotV1;
      readonly candidate: CanonicalStatisticalSeriesSnapshotV1;
    }
  | {
      readonly status: "conflict";
      readonly latest: CanonicalStatisticalSeriesSnapshotV1;
      readonly candidate: CanonicalStatisticalSeriesSnapshotV1;
    };

export type ReadCanonicalStatisticalSeriesVintageRedisResultV1 =
  | { readonly status: "absent" }
  | {
      readonly status: "available";
      readonly snapshot: CanonicalStatisticalSeriesSnapshotV1;
    }
  | { readonly status: "stored-snapshot-invalid" }
  | { readonly status: "duplicate-score" }
  | { readonly status: "invalid-response" }
  | { readonly status: "redis-failure" };

export interface CanonicalStatisticalSeriesVintageRedisAdapterV1 {
  readonly append: (
    family: string,
    series: CanonicalStatisticalSeriesInputV1,
  ) => Promise<AppendCanonicalStatisticalSeriesVintageRedisResultV1>;
  readonly readAsKnownAt: (
    family: string,
    asOf: number,
  ) => Promise<ReadCanonicalStatisticalSeriesVintageRedisResultV1>;
}

export interface CanonicalStatisticalSeriesVintageRedisDependencies {
  readonly readHead: CanonicalStatisticalSeriesVintageRedisReadHead;
  readonly readAsKnownAt: CanonicalStatisticalSeriesVintageRedisReadAsKnownAt;
  readonly compareAndAppend: CanonicalStatisticalSeriesVintageRedisCompareAndAppend;
}

const MAX_APPEND_ATTEMPTS = 3;

/**
 * The script validates the observed head again and enforces one member per
 * score before using NX. It never updates, removes, trims, or expires members.
 */
const CANONICAL_STATISTICAL_VINTAGE_COMPARE_AND_APPEND_SCRIPT = String.raw`
local key = KEYS[1]
local expected_mode = ARGV[1]
local expected_score = ARGV[2]
local expected_member = ARGV[3]
local candidate_score = ARGV[4]
local candidate_member = ARGV[5]
local current = redis.call("ZREVRANGE", key, 0, 1, "WITHSCORES")

if #current == 4 and tonumber(current[2]) == tonumber(current[4]) then
  return "duplicate-score"
end

if expected_mode == "absent" then
  if #current ~= 0 then return "race" end
elseif expected_mode == "present" then
  if #current ~= 2 and #current ~= 4 then return "race" end
  if current[1] ~= expected_member or
      tonumber(current[2]) ~= tonumber(expected_score) then
    return "race"
  end
else
  return "invalid-mode"
end

local at_score = redis.call(
  "ZRANGEBYSCORE",
  key,
  candidate_score,
  candidate_score
)
if #at_score > 1 then return "duplicate-score" end
if #at_score == 1 then
  if at_score[1] == candidate_member then return "already-present" end
  return "score-conflict"
end

local added = redis.call("ZADD", key, "NX", candidate_score, candidate_member)
if added ~= 1 then return "member-conflict" end
return "written"
`;

let redisClient: Redis | null = null;

function getRedisClient(): Redis {
  if (redisClient !== null) return redisClient;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new CanonicalStatisticalSeriesVintagePersistenceError(
      "redis-failure",
      "canonical statistical-series-vintage persistence is not configured.",
    );
  }
  redisClient = new Redis({
    url,
    token,
    automaticDeserialization: false,
  });
  return redisClient;
}

const productionReadHead: CanonicalStatisticalSeriesVintageRedisReadHead =
  async (key) => getRedisClient().zrange<unknown[]>(
    key,
    0,
    1,
    { rev: true, withScores: true },
  );

const productionReadAsKnownAt: CanonicalStatisticalSeriesVintageRedisReadAsKnownAt =
  async (key, asOf) => getRedisClient().zrange<unknown[]>(
    key,
    asOf,
    "-inf",
    {
      byScore: true,
      rev: true,
      withScores: true,
      offset: 0,
      count: 2,
    },
  );

const productionCompareAndAppend:
CanonicalStatisticalSeriesVintageRedisCompareAndAppend = async (
  key,
  expectedHead,
  candidateScore,
  candidateMember,
) => getRedisClient().eval(
  CANONICAL_STATISTICAL_VINTAGE_COMPARE_AND_APPEND_SCRIPT,
  [key],
  [
    expectedHead === null ? "absent" : "present",
    expectedHead === null ? "" : String(expectedHead.score),
    expectedHead?.member ?? "",
    String(candidateScore),
    candidateMember,
  ],
);

export interface CanonicalStatisticalVintageBindingV1 {
  readonly buildKey: (family: string) => string;
  readonly canonicalSeriesId: (family: string) => string;
  readonly validateCandidate: (family: string, series: CanonicalStatisticalSeriesInputV1) => CanonicalStatisticalSeriesSnapshotV1;
  readonly isValidSnapshot: (family: string, snapshot: CanonicalStatisticalSeriesSnapshotV1) => boolean;
  readonly error: (code: CanonicalStatisticalSeriesVintagePersistenceErrorCode, message: string) => CanonicalStatisticalSeriesVintagePersistenceError;
}

/** Trusted publisher binding validates both current and stored snapshots. No acquisition on import. */
export function createCanonicalStatisticalSeriesVintageRedisAdapterV1(
  binding: CanonicalStatisticalVintageBindingV1,
  dependencies: CanonicalStatisticalSeriesVintageRedisDependencies = {
    readHead: productionReadHead, readAsKnownAt: productionReadAsKnownAt,
    compareAndAppend: productionCompareAndAppend,
  },
): CanonicalStatisticalSeriesVintageRedisAdapterV1 {
  return Object.freeze({
    append: (family: string, series: CanonicalStatisticalSeriesInputV1) => appendWith(family, series, dependencies),
    readAsKnownAt: (family: string, asOf: number) => readAsKnownAtWith(family, asOf, dependencies.readAsKnownAt),
  });

  async function appendWith(
    family: string,
    series: CanonicalStatisticalSeriesInputV1,
    dependencies: Pick<
      CanonicalStatisticalSeriesVintageRedisDependencies,
      "readHead" | "compareAndAppend"
    >,
  ): Promise<AppendCanonicalStatisticalSeriesVintageRedisResultV1> {
    let key: string;
    let candidate: CanonicalStatisticalSeriesSnapshotV1;
    let candidateMember: string;
    try {
      key = binding.buildKey(family);
      candidate = binding.validateCandidate(family, series);
      candidateMember = serializeSnapshot(candidate, family);
    } catch {
      throw binding.error(
        "invalid-current",
        "Current statistical-series vintage or family is invalid.",
      );
    }

    for (let attempt = 0; attempt < MAX_APPEND_ATTEMPTS; attempt += 1) {
      const head = await readWindowForAppend(
        key,
        family,
        dependencies.readHead,
      );
      if (head !== null) {
        if (candidate.knownAt < head.snapshot.knownAt) {
          return Object.freeze({
            status: "stale",
            latest: head.snapshot,
            candidate,
          });
        }
        if (candidate.knownAt === head.snapshot.knownAt) {
          return candidate.sourceVersionId === head.snapshot.sourceVersionId
            ? Object.freeze({ status: "unchanged", latest: head.snapshot })
            : Object.freeze({
                status: "conflict",
                latest: head.snapshot,
                candidate,
              });
        }
        if (candidate.sourceVersionId === head.snapshot.sourceVersionId) {
          return Object.freeze({ status: "unchanged", latest: head.snapshot });
        }
      }

      const response = await atomicAppend(
        key,
        head === null
          ? null
          : { score: head.snapshot.knownAt, member: head.member },
        candidate.knownAt,
        candidateMember,
        dependencies.compareAndAppend,
      );
      if (
        response === "race" ||
        response === "already-present" ||
        response === "score-conflict"
      ) {
        continue;
      }
      if (response === "duplicate-score") throw duplicateScore();
      if (response === "member-conflict") throw invalidResponse();

      return head === null
        ? Object.freeze({ status: "initialized", snapshot: candidate })
        : Object.freeze({
            status: "advanced",
            previous: head.snapshot,
            snapshot: candidate,
          });
    }

    throw binding.error(
      "concurrency-conflict",
      "canonical statistical-series-vintage append retry limit was exhausted.",
    );
  }

  async function readAsKnownAtWith(
    family: string,
    asOf: number,
    read: CanonicalStatisticalSeriesVintageRedisReadAsKnownAt,
  ): Promise<ReadCanonicalStatisticalSeriesVintageRedisResultV1> {
    let key: string;
    try {
      key = binding.buildKey(family);
      assertCaptureTime(asOf);
    } catch {
      return Object.freeze({ status: "invalid-response" });
    }

    let raw: unknown;
    try {
      raw = await read(key, asOf);
    } catch {
      return Object.freeze({ status: "redis-failure" });
    }

    try {
      const selected = parseWindow(raw, family);
      if (selected === null) return Object.freeze({ status: "absent" });
      if (selected.snapshot.knownAt > asOf) throw invalidResponse();
      return Object.freeze({ status: "available", snapshot: selected.snapshot });
    } catch (error) {
      return Object.freeze({ status: readFailureStatus(error) });
    }
  }

  interface ParsedMember {
    readonly member: string;
    readonly snapshot: CanonicalStatisticalSeriesSnapshotV1;
  }

  async function readWindowForAppend(
    key: string,
    family: string,
    read: CanonicalStatisticalSeriesVintageRedisReadHead,
  ): Promise<ParsedMember | null> {
    let raw: unknown;
    try {
      raw = await read(key);
    } catch {
      throw binding.error(
        "redis-failure",
        "Reading the canonical statistical-series-vintage head from Redis failed.",
      );
    }
    return parseWindow(raw, family);
  }

  function parseWindow(
    value: unknown,
    family: string,
  ): ParsedMember | null {
    if (!Array.isArray(value) || value.length > 4 || value.length % 2 !== 0) {
      throw invalidResponse();
    }
    if (value.length === 0) return null;
    const parsed: ParsedMember[] = [];
    for (let index = 0; index < value.length; index += 2) {
      const member = value[index];
      const score = parseScore(value[index + 1]);
      if (typeof member !== "string") throw invalidResponse();
      const snapshot = parseStoredSnapshot(member, family);
      if (snapshot.knownAt !== score) throw storedSnapshotInvalid();
      parsed.push(Object.freeze({ member, snapshot }));
    }
    if (parsed.length === 2) {
      const firstScore = parsed[0]!.snapshot.knownAt;
      const secondScore = parsed[1]!.snapshot.knownAt;
      if (firstScore === secondScore) throw duplicateScore();
      if (firstScore < secondScore) throw invalidResponse();
    }
    return parsed[0]!;
  }

  function parseStoredSnapshot(
    raw: string,
    family: string,
  ): CanonicalStatisticalSeriesSnapshotV1 {
    let value: unknown;
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      throw storedSnapshotInvalid();
    }
    const memory = parseCanonicalStatisticalSeriesMemoryV1({
      schemaVersion: CANONICAL_STATISTICAL_SERIES_MEMORY_SCHEMA_VERSION_V1,
      canonicalSeriesId:
        binding.canonicalSeriesId(family),
      snapshots: [value],
    });
    const snapshot = memory?.snapshots[0];
    if (
      snapshot === undefined ||
      JSON.stringify(snapshot) !== raw ||
      !binding.isValidSnapshot(family, snapshot)
    ) {
      throw storedSnapshotInvalid();
    }
    return snapshot;
  }

  function serializeSnapshot(snapshot: CanonicalStatisticalSeriesSnapshotV1, family: string): string {
    const raw = JSON.stringify(snapshot);
    if (JSON.stringify(parseStoredSnapshot(raw, family)) !== raw) throw invalidResponse();
    return raw;
  }

  async function atomicAppend(
    key: string,
    expectedHead: CanonicalStatisticalSeriesVintageRedisExpectedHeadV1 | null,
    score: number,
    member: string,
    append: CanonicalStatisticalSeriesVintageRedisCompareAndAppend,
  ): Promise<
    | "written"
    | "race"
    | "already-present"
    | "score-conflict"
    | "duplicate-score"
    | "member-conflict"
  > {
    let response: unknown;
    try {
      response = await append(key, expectedHead, score, member);
    } catch {
      throw binding.error(
        "redis-failure",
        "Atomic canonical statistical-series-vintage append failed.",
      );
    }
    if (
      response !== "written" &&
      response !== "race" &&
      response !== "already-present" &&
      response !== "score-conflict" &&
      response !== "duplicate-score" &&
      response !== "member-conflict"
    ) {
      throw invalidResponse();
    }
    return response;
  }

  function parseScore(value: unknown): number {
    const score = typeof value === "number"
      ? value
      : typeof value === "string" && /^(?:0|[1-9]\d*)$/.test(value)
        ? Number(value)
        : Number.NaN;
    if (!Number.isSafeInteger(score) || score < 0) throw invalidResponse();
    return score;
  }

  function assertCaptureTime(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError("Invalid canonical statistical-series-vintage asOf.");
    }
  }

  function readFailureStatus(
    error: unknown,
  ): "stored-snapshot-invalid" | "duplicate-score" | "invalid-response" {
    if (error instanceof CanonicalStatisticalSeriesVintagePersistenceError) {
      if (error.code === "stored-snapshot-invalid") return error.code;
      if (error.code === "duplicate-score") return error.code;
    }
    return "invalid-response";
  }

  function storedSnapshotInvalid(): CanonicalStatisticalSeriesVintagePersistenceError {
    return binding.error(
      "stored-snapshot-invalid",
      "Stored canonical statistical-series vintage is invalid and was not changed.",
    );
  }

  function duplicateScore(): CanonicalStatisticalSeriesVintagePersistenceError {
    return binding.error(
      "duplicate-score",
      "Stored canonical statistical-series vintages contain a duplicate score.",
    );
  }

  function invalidResponse(): CanonicalStatisticalSeriesVintagePersistenceError {
    return binding.error(
      "invalid-response",
      "Redis returned an invalid canonical statistical-series-vintage response.",
    );
  }
}
