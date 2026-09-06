import { Redis } from "@upstash/redis";

import type { MarketAssetId } from "../core/assets";
import {
  buildDecisionSnapshotKey,
  parseDecisionSnapshot,
  type AdvanceDecisionSnapshotResult,
  type CanonicalDecisionSnapshot,
} from "../engine/decisionPersistence";

export type DecisionSnapshotRedisEval = (
  script: string,
  keys: readonly string[],
  args: readonly string[],
) => Promise<unknown>;

export type DecisionSnapshotPersistenceErrorCode =
  | "invalid-current"
  | "redis-failure"
  | "invalid-response";

export class DecisionSnapshotPersistenceError extends Error {
  readonly code: DecisionSnapshotPersistenceErrorCode;
  readonly cause?: unknown;

  constructor(
    code: DecisionSnapshotPersistenceErrorCode,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = "DecisionSnapshotPersistenceError";
    this.code = code;
    this.cause = cause;
  }
}

const ADVANCE_DECISION_SNAPSHOT_SCRIPT = `
local key = KEYS[1]
local candidate_raw = ARGV[1]
local expected_asset = ARGV[2]

local function decode(value)
  local ok, decoded = pcall(cjson.decode, value)
  if not ok or type(decoded) ~= "table" then
    return nil
  end
  return decoded
end

local function is_leap_year(year)
  return year % 400 == 0 or (year % 4 == 0 and year % 100 ~= 0)
end

local function is_canonical_timestamp(value)
  if type(value) ~= "string" then
    return false
  end

  local year, month, day, hour, minute, second, millisecond = string.match(
    value,
    "^(%d%d%d%d)%-(%d%d)%-(%d%d)T(%d%d):(%d%d):(%d%d)%.(%d%d%d)Z$"
  )
  if not year then
    return false
  end

  year = tonumber(year)
  month = tonumber(month)
  day = tonumber(day)
  hour = tonumber(hour)
  minute = tonumber(minute)
  second = tonumber(second)
  millisecond = tonumber(millisecond)

  if month < 1 or month > 12 or hour > 23 or minute > 59 or second > 59 or millisecond > 999 then
    return false
  end

  local days = { 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 }
  if month == 2 and is_leap_year(year) then
    days[2] = 29
  end

  return day >= 1 and day <= days[month]
end

local function valid_decision(decision)
  if type(decision) ~= "table" or type(decision.data) ~= "table" then
    return false
  end

  if decision.availability ~= "available" and decision.availability ~= "partial" then
    return false
  end

  local score = decision.data.score
  local stance = decision.data.stance
  if type(score) ~= "number" or score ~= score or score == math.huge or score == -math.huge or score < -1 or score > 1 then
    return false
  end

  if not ((score > 0 and stance == "bullish") or (score < 0 and stance == "bearish") or (score == 0 and stance == "neutral")) then
    return false
  end

  if decision.availability == "partial" then
    if type(decision.missing) ~= "table" or #decision.missing == 0 then
      return false
    end

    local previous = nil
    for index = 1, #decision.missing do
      local value = decision.missing[index]
      if type(value) ~= "string" or value == "" or string.match(value, "^%s") or string.match(value, "%s$") then
        return false
      end
      if previous ~= nil and previous >= value then
        return false
      end
      previous = value
    end
  end

  return true
end

local function valid_snapshot(snapshot)
  return type(snapshot) == "table"
    and snapshot.schemaVersion == 1
    and snapshot.engineResultVersion == "3"
    and snapshot.assetId == expected_asset
    and is_canonical_timestamp(snapshot.computedAt)
    and valid_decision(snapshot.decision)
end

local function arrays_equal(left, right)
  if #left ~= #right then
    return false
  end
  for index = 1, #left do
    if left[index] ~= right[index] then
      return false
    end
  end
  return true
end

local function semantically_equal(left, right)
  if left.schemaVersion ~= right.schemaVersion
    or left.engineResultVersion ~= right.engineResultVersion
    or left.assetId ~= right.assetId
    or left.decision.availability ~= right.decision.availability
    or left.decision.data.score ~= right.decision.data.score
    or left.decision.data.stance ~= right.decision.data.stance then
    return false
  end

  if left.decision.availability == "available" then
    return true
  end

  return arrays_equal(left.decision.missing, right.decision.missing)
end

local candidate = decode(candidate_raw)
if not candidate or not valid_snapshot(candidate) then
  return { "invalid-candidate", "" }
end

local stored_raw = redis.call("GET", key)
if not stored_raw then
  redis.call("SET", key, candidate_raw)
  return { "initialized", "" }
end

local stored = decode(stored_raw)
if not stored or not valid_snapshot(stored) then
  redis.call("SET", key, candidate_raw)
  return { "initialized", "" }
end

if candidate.computedAt < stored.computedAt then
  return { "stale", stored_raw }
end

local equal = semantically_equal(candidate, stored)
if candidate.computedAt == stored.computedAt then
  if equal then
    return { "unchanged", stored_raw }
  end
  return { "stale", stored_raw }
end

if equal then
  return { "unchanged", stored_raw }
end

redis.call("SET", key, candidate_raw)
return { "advanced", stored_raw }
`;

let redisClient: Redis | null = null;

function getRedisClient(): Redis {
  if (redisClient) {
    return redisClient;
  }

  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new DecisionSnapshotPersistenceError(
      "redis-failure",
      "Decision snapshot persistence is not configured.",
    );
  }

  redisClient = new Redis({ url, token });
  return redisClient;
}

const productionEval: DecisionSnapshotRedisEval = async (
  script,
  keys,
  args,
) => getRedisClient().eval(script, [...keys], [...args]);

export function createDecisionSnapshotRedisAdapter(
  evaluate: DecisionSnapshotRedisEval,
): (
  currentSnapshot: CanonicalDecisionSnapshot,
) => Promise<AdvanceDecisionSnapshotResult> {
  return async (currentSnapshot) =>
    advanceWithEval(currentSnapshot, evaluate);
}

export async function advanceCanonicalDecisionSnapshot(
  currentSnapshot: CanonicalDecisionSnapshot,
): Promise<AdvanceDecisionSnapshotResult> {
  return advanceWithEval(currentSnapshot, productionEval);
}

async function advanceWithEval(
  currentSnapshot: CanonicalDecisionSnapshot,
  evaluate: DecisionSnapshotRedisEval,
): Promise<AdvanceDecisionSnapshotResult> {
  const parsedCurrent = parseDecisionSnapshot(currentSnapshot);

  if (parsedCurrent === null) {
    throw new DecisionSnapshotPersistenceError(
      "invalid-current",
      "Current Decision snapshot is invalid.",
    );
  }

  const canonicalCurrent: CanonicalDecisionSnapshot = {
    ...parsedCurrent,
    computedAt: new Date(parsedCurrent.computedAt).toISOString(),
  };
  const key = buildDecisionSnapshotKey(canonicalCurrent.assetId);
  const serialized = JSON.stringify(canonicalCurrent);

  let rawResult: unknown;

  try {
    rawResult = await evaluate(
      ADVANCE_DECISION_SNAPSHOT_SCRIPT,
      [key],
      [serialized, canonicalCurrent.assetId],
    );
  } catch (error) {
    if (error instanceof DecisionSnapshotPersistenceError) {
      throw error;
    }

    throw new DecisionSnapshotPersistenceError(
      "redis-failure",
      "Atomic Decision snapshot persistence failed.",
      error,
    );
  }

  return parseAtomicResult(rawResult, canonicalCurrent.assetId);
}

function parseAtomicResult(
  value: unknown,
  assetId: MarketAssetId,
): AdvanceDecisionSnapshotResult {
  if (!Array.isArray(value) || value.length < 2) {
    throw invalidResponse();
  }

  const [status, previousRaw] = value;

  if (status === "invalid-candidate") {
    throw invalidResponse();
  }

  if (status === "initialized") {
    if (previousRaw !== "" && previousRaw !== null) {
      throw invalidResponse();
    }

    return { status: "initialized", previous: null };
  }

  if (
    status !== "unchanged" &&
    status !== "advanced" &&
    status !== "stale"
  ) {
    throw invalidResponse();
  }

  if (typeof previousRaw !== "string") {
    throw invalidResponse();
  }

  let previousValue: unknown;

  try {
    previousValue = JSON.parse(previousRaw);
  } catch (error) {
    throw invalidResponse(error);
  }

  const previous = parseDecisionSnapshot(previousValue);

  if (previous === null || previous.assetId !== assetId) {
    throw invalidResponse();
  }

  return { status, previous };
}

function invalidResponse(cause?: unknown): DecisionSnapshotPersistenceError {
  return new DecisionSnapshotPersistenceError(
    "invalid-response",
    "Redis returned an invalid Decision snapshot result.",
    cause,
  );
}
