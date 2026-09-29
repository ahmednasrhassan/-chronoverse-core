import { Redis } from "@upstash/redis";

import {
  CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1,
  type CanonicalStatisticalSeriesInputV1,
} from "../services/canonicalObservationSeries";
import {
  CANONICAL_STATISTICAL_SERIES_MEMORY_SCHEMA_VERSION_V1,
  buildCanonicalStatisticalSeriesSnapshotV1,
  parseCanonicalStatisticalSeriesMemoryV1,
  type CanonicalStatisticalSeriesSnapshotV1,
} from "../services/canonicalStatisticalSeriesMemory";
import {
  EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1,
  buildEurostatSelectedSeriesSourceVersionIdV1,
  type EurostatEuroAreaMacroFamilyV1,
} from "../providers/eurostat/macroSeries";

export type EurostatMacroSeriesVintageRedisReadHead = (
  key: string,
) => Promise<unknown>;

export type EurostatMacroSeriesVintageRedisReadAsKnownAt = (
  key: string,
  asOf: number,
) => Promise<unknown>;

export interface EurostatMacroSeriesVintageRedisExpectedHeadV1 {
  readonly score: number;
  readonly member: string;
}

export type EurostatMacroSeriesVintageRedisCompareAndAppend = (
  key: string,
  expectedHead: EurostatMacroSeriesVintageRedisExpectedHeadV1 | null,
  candidateScore: number,
  candidateMember: string,
) => Promise<unknown>;

export type EurostatMacroSeriesVintagePersistenceErrorCode =
  | "invalid-current"
  | "stored-snapshot-invalid"
  | "duplicate-score"
  | "redis-failure"
  | "invalid-response"
  | "concurrency-conflict";

export class EurostatMacroSeriesVintagePersistenceError extends Error {
  readonly code: EurostatMacroSeriesVintagePersistenceErrorCode;

  constructor(
    code: EurostatMacroSeriesVintagePersistenceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EurostatMacroSeriesVintagePersistenceError";
    this.code = code;
  }
}

export type AppendEurostatMacroSeriesVintageRedisResultV1 =
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

export type ReadEurostatMacroSeriesVintageRedisResultV1 =
  | { readonly status: "absent" }
  | {
      readonly status: "available";
      readonly snapshot: CanonicalStatisticalSeriesSnapshotV1;
    }
  | { readonly status: "stored-snapshot-invalid" }
  | { readonly status: "duplicate-score" }
  | { readonly status: "invalid-response" }
  | { readonly status: "redis-failure" };

export interface EurostatMacroSeriesVintageRedisAdapterV1 {
  readonly append: (
    family: EurostatEuroAreaMacroFamilyV1,
    series: CanonicalStatisticalSeriesInputV1,
  ) => Promise<AppendEurostatMacroSeriesVintageRedisResultV1>;
  readonly readAsKnownAt: (
    family: EurostatEuroAreaMacroFamilyV1,
    asOf: number,
  ) => Promise<ReadEurostatMacroSeriesVintageRedisResultV1>;
}

interface EurostatMacroSeriesVintageRedisDependencies {
  readonly readHead: EurostatMacroSeriesVintageRedisReadHead;
  readonly readAsKnownAt: EurostatMacroSeriesVintageRedisReadAsKnownAt;
  readonly compareAndAppend: EurostatMacroSeriesVintageRedisCompareAndAppend;
}

const KEY_PREFIX =
  "chronoverse:markets:eurostat:macro-series-vintages-v1:" as const;
const MAX_APPEND_ATTEMPTS = 3;

/**
 * The script validates the observed head again and enforces one member per
 * score before using NX. It never updates, removes, trims, or expires members.
 */
const EUROSTAT_MACRO_VINTAGE_COMPARE_AND_APPEND_SCRIPT = String.raw`
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
    throw new EurostatMacroSeriesVintagePersistenceError(
      "redis-failure",
      "Eurostat macro-vintage persistence is not configured.",
    );
  }
  redisClient = new Redis({
    url,
    token,
    automaticDeserialization: false,
  });
  return redisClient;
}

const productionReadHead: EurostatMacroSeriesVintageRedisReadHead =
  async (key) => getRedisClient().zrange<unknown[]>(
    key,
    0,
    1,
    { rev: true, withScores: true },
  );

const productionReadAsKnownAt: EurostatMacroSeriesVintageRedisReadAsKnownAt =
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
EurostatMacroSeriesVintageRedisCompareAndAppend = async (
  key,
  expectedHead,
  candidateScore,
  candidateMember,
) => getRedisClient().eval(
  EUROSTAT_MACRO_VINTAGE_COMPARE_AND_APPEND_SCRIPT,
  [key],
  [
    expectedHead === null ? "absent" : "present",
    expectedHead === null ? "" : String(expectedHead.score),
    expectedHead?.member ?? "",
    String(candidateScore),
    candidateMember,
  ],
);

export function buildEurostatMacroSeriesVintageRedisKeyV1(
  family: EurostatEuroAreaMacroFamilyV1,
): string {
  const spec = lockedSpec(family);
  return `${KEY_PREFIX}${spec.canonicalSeriesId}`;
}

export function createEurostatMacroSeriesVintageRedisAdapterV1(
  dependencies: EurostatMacroSeriesVintageRedisDependencies,
): EurostatMacroSeriesVintageRedisAdapterV1 {
  return Object.freeze({
    append: (
      family: EurostatEuroAreaMacroFamilyV1,
      series: CanonicalStatisticalSeriesInputV1,
    ) => appendWith(family, series, dependencies),
    readAsKnownAt: (
      family: EurostatEuroAreaMacroFamilyV1,
      asOf: number,
    ) => readAsKnownAtWith(
      family,
      asOf,
      dependencies.readAsKnownAt,
    ),
  });
}

export async function appendEurostatMacroSeriesVintageRedisV1(
  family: EurostatEuroAreaMacroFamilyV1,
  series: CanonicalStatisticalSeriesInputV1,
): Promise<AppendEurostatMacroSeriesVintageRedisResultV1> {
  return appendWith(family, series, {
    readHead: productionReadHead,
    compareAndAppend: productionCompareAndAppend,
  });
}

export async function readEurostatMacroSeriesVintageAsKnownAtRedisV1(
  family: EurostatEuroAreaMacroFamilyV1,
  asOf: number,
): Promise<ReadEurostatMacroSeriesVintageRedisResultV1> {
  return readAsKnownAtWith(family, asOf, productionReadAsKnownAt);
}

async function appendWith(
  family: EurostatEuroAreaMacroFamilyV1,
  series: CanonicalStatisticalSeriesInputV1,
  dependencies: Pick<
    EurostatMacroSeriesVintageRedisDependencies,
    "readHead" | "compareAndAppend"
  >,
): Promise<AppendEurostatMacroSeriesVintageRedisResultV1> {
  let key: string;
  let candidate: CanonicalStatisticalSeriesSnapshotV1;
  let candidateMember: string;
  try {
    key = buildEurostatMacroSeriesVintageRedisKeyV1(family);
    candidate = validateCandidate(family, series);
    candidateMember = serializeSnapshot(candidate);
  } catch {
    throw new EurostatMacroSeriesVintagePersistenceError(
      "invalid-current",
      "Current Eurostat macro-series vintage or family is invalid.",
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

  throw new EurostatMacroSeriesVintagePersistenceError(
    "concurrency-conflict",
    "Eurostat macro-vintage append retry limit was exhausted.",
  );
}

async function readAsKnownAtWith(
  family: EurostatEuroAreaMacroFamilyV1,
  asOf: number,
  read: EurostatMacroSeriesVintageRedisReadAsKnownAt,
): Promise<ReadEurostatMacroSeriesVintageRedisResultV1> {
  let key: string;
  try {
    key = buildEurostatMacroSeriesVintageRedisKeyV1(family);
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
  family: EurostatEuroAreaMacroFamilyV1,
  read: EurostatMacroSeriesVintageRedisReadHead,
): Promise<ParsedMember | null> {
  let raw: unknown;
  try {
    raw = await read(key);
  } catch {
    throw new EurostatMacroSeriesVintagePersistenceError(
      "redis-failure",
      "Reading the Eurostat macro-vintage head from Redis failed.",
    );
  }
  return parseWindow(raw, family);
}

function parseWindow(
  value: unknown,
  family: EurostatEuroAreaMacroFamilyV1,
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
  family: EurostatEuroAreaMacroFamilyV1,
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
      EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1[family].canonicalSeriesId,
    snapshots: [value],
  });
  const snapshot = memory?.snapshots[0];
  if (
    snapshot === undefined ||
    JSON.stringify(snapshot) !== raw ||
    !isLockedSnapshot(family, snapshot)
  ) {
    throw storedSnapshotInvalid();
  }
  return snapshot;
}

function validateCandidate(
  family: EurostatEuroAreaMacroFamilyV1,
  series: CanonicalStatisticalSeriesInputV1,
): CanonicalStatisticalSeriesSnapshotV1 {
  if (!hasExactLockedProvenance(family, series.metadata)) {
    throw new TypeError("Eurostat macro-series provenance is not locked.");
  }
  const snapshot = buildCanonicalStatisticalSeriesSnapshotV1(series);
  if (!isLockedSnapshot(family, snapshot)) {
    throw new TypeError("Eurostat macro-series candidate is not locked.");
  }
  return snapshot;
}

function hasExactLockedProvenance(
  family: EurostatEuroAreaMacroFamilyV1,
  metadata: CanonicalStatisticalSeriesInputV1["metadata"],
): boolean {
  const spec = lockedSpec(family);
  return metadata.provenanceVersion ===
      CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1 &&
    metadata.provider === "eurostat" &&
    metadata.source === "Eurostat Statistics API" &&
    metadata.originalPublisher === "Eurostat" &&
    metadata.substitution?.status === "none" &&
    Object.keys(metadata.substitution).length === 1 &&
    metadata.canonicalSeriesId === spec.canonicalSeriesId &&
    metadata.sourceSeriesId === spec.sourceSeriesId &&
    metadata.sourceUrl === spec.sourceUrl &&
    metadata.frequency === spec.frequency &&
    metadata.unit === spec.unit &&
    metadata.releaseTimestamp === undefined;
}

function isLockedSnapshot(
  family: EurostatEuroAreaMacroFamilyV1,
  snapshot: CanonicalStatisticalSeriesSnapshotV1,
): boolean {
  const spec = lockedSpec(family);
  const { metadata, observations } = snapshot.series;
  if (
    observations.length === 0 ||
    snapshot.canonicalSeriesId !== spec.canonicalSeriesId ||
    snapshot.knownAt !== metadata.fetchedAt ||
    snapshot.sourceVersionId !== metadata.sourceVersionId ||
    metadata.provenanceVersion !==
      CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1 ||
    metadata.provider !== "eurostat" ||
    metadata.source !== "Eurostat Statistics API" ||
    metadata.originalPublisher !== "Eurostat" ||
    metadata.substitution?.status !== "none" ||
    metadata.canonicalSeriesId !== spec.canonicalSeriesId ||
    metadata.sourceSeriesId !== spec.sourceSeriesId ||
    metadata.sourceUrl !== spec.sourceUrl ||
    metadata.frequency !== spec.frequency ||
    metadata.unit !== spec.unit ||
    metadata.releaseTimestamp !== undefined
  ) {
    return false;
  }
  return metadata.sourceVersionId ===
    buildEurostatSelectedSeriesSourceVersionIdV1(family, observations);
}

function serializeSnapshot(
  snapshot: CanonicalStatisticalSeriesSnapshotV1,
): string {
  const raw = JSON.stringify(snapshot);
  const parsed = parseStoredSnapshot(raw, familyForSnapshot(snapshot));
  if (JSON.stringify(parsed) !== raw) {
    throw invalidResponse();
  }
  return raw;
}

function familyForSnapshot(
  snapshot: CanonicalStatisticalSeriesSnapshotV1,
): EurostatEuroAreaMacroFamilyV1 {
  for (const family of ["hicp", "gdp"] as const) {
    if (
      EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1[family].canonicalSeriesId ===
      snapshot.canonicalSeriesId
    ) {
      return family;
    }
  }
  throw new TypeError("Unknown Eurostat macro-series identity.");
}

async function atomicAppend(
  key: string,
  expectedHead: EurostatMacroSeriesVintageRedisExpectedHeadV1 | null,
  score: number,
  member: string,
  append: EurostatMacroSeriesVintageRedisCompareAndAppend,
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
    throw new EurostatMacroSeriesVintagePersistenceError(
      "redis-failure",
      "Atomic Eurostat macro-vintage append failed.",
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
    throw new TypeError("Invalid Eurostat macro-vintage asOf.");
  }
}

function lockedSpec(family: EurostatEuroAreaMacroFamilyV1) {
  if (
    !Object.prototype.hasOwnProperty.call(
      EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1,
      family,
    )
  ) {
    throw new TypeError("Invalid Eurostat macro family.");
  }
  return EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1[family];
}

function readFailureStatus(
  error: unknown,
): "stored-snapshot-invalid" | "duplicate-score" | "invalid-response" {
  if (error instanceof EurostatMacroSeriesVintagePersistenceError) {
    if (error.code === "stored-snapshot-invalid") return error.code;
    if (error.code === "duplicate-score") return error.code;
  }
  return "invalid-response";
}

function storedSnapshotInvalid(): EurostatMacroSeriesVintagePersistenceError {
  return new EurostatMacroSeriesVintagePersistenceError(
    "stored-snapshot-invalid",
    "Stored Eurostat macro vintage is invalid and was not changed.",
  );
}

function duplicateScore(): EurostatMacroSeriesVintagePersistenceError {
  return new EurostatMacroSeriesVintagePersistenceError(
    "duplicate-score",
    "Stored Eurostat macro vintages contain a duplicate score.",
  );
}

function invalidResponse(): EurostatMacroSeriesVintagePersistenceError {
  return new EurostatMacroSeriesVintagePersistenceError(
    "invalid-response",
    "Redis returned an invalid Eurostat macro-vintage response.",
  );
}
