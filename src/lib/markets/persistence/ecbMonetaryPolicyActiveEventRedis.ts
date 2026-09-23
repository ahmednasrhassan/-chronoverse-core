import { Redis } from "@upstash/redis";

import {
  ECB_CURRENT_DECISION_LOCAL_TIME,
  ecbMonetaryPolicyCanonicalEventIdV1,
  ecbScheduledInstantV1,
} from "../events/ecbMonetaryPolicy";

export const ECB_MONETARY_POLICY_ACTIVE_EVENT_SCHEMA_VERSION_V1 =
  "ecb-monetary-policy-active-event-v1" as const;
export const ECB_MONETARY_POLICY_ACTIVE_EVENT_REDIS_KEY_V1 =
  "chronoverse:events:ecb-monetary-policy:active-v1" as const;

export interface EcbMonetaryPolicyActiveEventV1 {
  readonly schemaVersion:
    typeof ECB_MONETARY_POLICY_ACTIVE_EVENT_SCHEMA_VERSION_V1;
  readonly canonicalEventId: string;
  readonly canonicalMeetingDate: string;
  readonly currentMeetingDate: string;
  readonly scheduledAt: string;
}

export type EcbMonetaryPolicyActiveEventPersistenceErrorCode =
  | "invalid-current"
  | "stored-pointer-invalid"
  | "redis-failure"
  | "invalid-response"
  | "concurrency-conflict";

export class EcbMonetaryPolicyActiveEventPersistenceError extends Error {
  readonly code: EcbMonetaryPolicyActiveEventPersistenceErrorCode;

  constructor(
    code: EcbMonetaryPolicyActiveEventPersistenceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EcbMonetaryPolicyActiveEventPersistenceError";
    this.code = code;
  }
}

export type ReadEcbMonetaryPolicyActiveEventRedisResultV1 =
  | { readonly status: "absent" }
  | {
      readonly status: "available";
      readonly pointer: EcbMonetaryPolicyActiveEventV1;
    }
  | { readonly status: "stored-pointer-invalid" }
  | { readonly status: "redis-failure" };

export type WriteEcbMonetaryPolicyActiveEventRedisResultV1 = {
  readonly status: "initialized" | "updated" | "unchanged";
  readonly pointer: EcbMonetaryPolicyActiveEventV1;
};

export type EcbMonetaryPolicyActiveEventRedisRead = (
  key: string,
) => Promise<unknown>;

export type EcbMonetaryPolicyActiveEventRedisCompareAndSet = (
  key: string,
  expectedRaw: string | null,
  replacementRaw: string,
) => Promise<unknown>;

export interface EcbMonetaryPolicyActiveEventRedisAdapterV1 {
  readonly read: () => Promise<ReadEcbMonetaryPolicyActiveEventRedisResultV1>;
  readonly write: (
    expected: EcbMonetaryPolicyActiveEventV1 | null,
    replacement: EcbMonetaryPolicyActiveEventV1,
  ) => Promise<WriteEcbMonetaryPolicyActiveEventRedisResultV1>;
}

const MAX_CAS_ATTEMPTS = 3;

/** Domain-agnostic exact-state compare-and-set; pointer semantics stay in TS. */
const ECB_ACTIVE_EVENT_CAS_SCRIPT = String.raw`
local key = KEYS[1]
local expected_mode = ARGV[1]
local expected_raw = ARGV[2]
local replacement_raw = ARGV[3]
local current_raw = redis.call("GET", key)

if expected_mode == "absent" then
  if current_raw then return "race" end
elseif expected_mode == "present" then
  if not current_raw or current_raw ~= expected_raw then return "race" end
else
  return "invalid-mode"
end

redis.call("SET", key, replacement_raw)
return "written"
`;

let redisClient: Redis | null = null;

function getRedisClient(): Redis {
  if (redisClient !== null) return redisClient;

  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new EcbMonetaryPolicyActiveEventPersistenceError(
      "redis-failure",
      "ECB active-event persistence is not configured.",
    );
  }

  redisClient = new Redis({
    url,
    token,
    automaticDeserialization: false,
  });
  return redisClient;
}

const productionRead: EcbMonetaryPolicyActiveEventRedisRead = async (key) =>
  getRedisClient().get(key);

const productionCompareAndSet:
EcbMonetaryPolicyActiveEventRedisCompareAndSet = async (
  key,
  expectedRaw,
  replacementRaw,
) => getRedisClient().eval(
  ECB_ACTIVE_EVENT_CAS_SCRIPT,
  [key],
  [expectedRaw === null ? "absent" : "present", expectedRaw ?? "", replacementRaw],
);

export function createEcbMonetaryPolicyActiveEventRedisAdapterV1(
  dependencies: {
    readonly read: EcbMonetaryPolicyActiveEventRedisRead;
    readonly compareAndSet: EcbMonetaryPolicyActiveEventRedisCompareAndSet;
  },
): EcbMonetaryPolicyActiveEventRedisAdapterV1 {
  return Object.freeze({
    read: () => readWith(dependencies.read),
    write: (
      expected: EcbMonetaryPolicyActiveEventV1 | null,
      replacement: EcbMonetaryPolicyActiveEventV1,
    ) => writeWithCas(expected, replacement, dependencies),
  });
}

export async function readEcbMonetaryPolicyActiveEventRedisV1(): Promise<
  ReadEcbMonetaryPolicyActiveEventRedisResultV1
> {
  return readWith(productionRead);
}

export async function writeEcbMonetaryPolicyActiveEventRedisV1(
  expected: EcbMonetaryPolicyActiveEventV1 | null,
  replacement: EcbMonetaryPolicyActiveEventV1,
): Promise<WriteEcbMonetaryPolicyActiveEventRedisResultV1> {
  return writeWithCas(expected, replacement, {
    read: productionRead,
    compareAndSet: productionCompareAndSet,
  });
}

export function parseEcbMonetaryPolicyActiveEventV1(
  value: unknown,
): EcbMonetaryPolicyActiveEventV1 | null {
  try {
    if (!isRecord(value)) return null;
    const keys = Object.keys(value).sort();
    if (
      keys.length !== 5 ||
      keys.join(",") !==
        "canonicalEventId,canonicalMeetingDate,currentMeetingDate,scheduledAt,schemaVersion" ||
      value.schemaVersion !==
        ECB_MONETARY_POLICY_ACTIVE_EVENT_SCHEMA_VERSION_V1 ||
      typeof value.canonicalEventId !== "string" ||
      typeof value.canonicalMeetingDate !== "string" ||
      typeof value.currentMeetingDate !== "string" ||
      typeof value.scheduledAt !== "string"
    ) {
      return null;
    }

    if (
      ecbMonetaryPolicyCanonicalEventIdV1(value.canonicalMeetingDate) !==
      value.canonicalEventId ||
      ecbScheduledInstantV1(
        value.currentMeetingDate,
        ECB_CURRENT_DECISION_LOCAL_TIME,
      ) !== value.scheduledAt
    ) {
      return null;
    }

    return Object.freeze({
      schemaVersion: ECB_MONETARY_POLICY_ACTIVE_EVENT_SCHEMA_VERSION_V1,
      canonicalEventId: value.canonicalEventId,
      canonicalMeetingDate: value.canonicalMeetingDate,
      currentMeetingDate: value.currentMeetingDate,
      scheduledAt: value.scheduledAt,
    });
  } catch {
    return null;
  }
}

async function readWith(
  read: EcbMonetaryPolicyActiveEventRedisRead,
): Promise<ReadEcbMonetaryPolicyActiveEventRedisResultV1> {
  let value: unknown;
  try {
    value = await read(ECB_MONETARY_POLICY_ACTIVE_EVENT_REDIS_KEY_V1);
  } catch {
    return Object.freeze({ status: "redis-failure" });
  }

  if (value === null) return Object.freeze({ status: "absent" });
  if (typeof value !== "string") {
    return Object.freeze({ status: "stored-pointer-invalid" });
  }
  const pointer = parseRawPointer(value);
  return pointer === null
    ? Object.freeze({ status: "stored-pointer-invalid" })
    : Object.freeze({ status: "available", pointer });
}

async function writeWithCas(
  expectedValue: EcbMonetaryPolicyActiveEventV1 | null,
  replacementValue: EcbMonetaryPolicyActiveEventV1,
  dependencies: {
    readonly read: EcbMonetaryPolicyActiveEventRedisRead;
    readonly compareAndSet: EcbMonetaryPolicyActiveEventRedisCompareAndSet;
  },
): Promise<WriteEcbMonetaryPolicyActiveEventRedisResultV1> {
  const expected = expectedValue === null ? null : validateCurrent(expectedValue);
  const replacement = validateCurrent(replacementValue);
  const replacementRaw = JSON.stringify(replacement);

  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const currentRaw = await readRawForWrite(dependencies.read);
    if (currentRaw === null) {
      if (expected !== null) throw concurrencyConflict();
      const result = await compareAndSet(
        null,
        replacementRaw,
        dependencies.compareAndSet,
      );
      if (result === "race") continue;
      return Object.freeze({ status: "initialized", pointer: replacement });
    }

    const current = parseRawPointer(currentRaw);
    if (current === null) {
      throw new EcbMonetaryPolicyActiveEventPersistenceError(
        "stored-pointer-invalid",
        "Stored ECB active-event pointer is invalid and was not overwritten.",
      );
    }
    if (samePointer(current, replacement)) {
      return Object.freeze({ status: "unchanged", pointer: current });
    }
    if (expected === null || !samePointer(current, expected)) {
      throw concurrencyConflict();
    }

    const result = await compareAndSet(
      currentRaw,
      replacementRaw,
      dependencies.compareAndSet,
    );
    if (result === "race") continue;
    return Object.freeze({ status: "updated", pointer: replacement });
  }

  throw concurrencyConflict();
}

function validateCurrent(
  value: EcbMonetaryPolicyActiveEventV1,
): EcbMonetaryPolicyActiveEventV1 {
  const parsed = parseEcbMonetaryPolicyActiveEventV1(value);
  if (parsed === null) {
    throw new EcbMonetaryPolicyActiveEventPersistenceError(
      "invalid-current",
      "Requested ECB active-event pointer is invalid.",
    );
  }
  return parsed;
}

async function readRawForWrite(
  read: EcbMonetaryPolicyActiveEventRedisRead,
): Promise<string | null> {
  let value: unknown;
  try {
    value = await read(ECB_MONETARY_POLICY_ACTIVE_EVENT_REDIS_KEY_V1);
  } catch {
    throw new EcbMonetaryPolicyActiveEventPersistenceError(
      "redis-failure",
      "Reading the ECB active-event pointer from Redis failed.",
    );
  }
  if (value === null) return null;
  if (typeof value !== "string") throw invalidResponse();
  return value;
}

async function compareAndSet(
  expectedRaw: string | null,
  replacementRaw: string,
  compare: EcbMonetaryPolicyActiveEventRedisCompareAndSet,
): Promise<"written" | "race"> {
  let value: unknown;
  try {
    value = await compare(
      ECB_MONETARY_POLICY_ACTIVE_EVENT_REDIS_KEY_V1,
      expectedRaw,
      replacementRaw,
    );
  } catch {
    throw new EcbMonetaryPolicyActiveEventPersistenceError(
      "redis-failure",
      "Atomic ECB active-event compare-and-set failed.",
    );
  }
  if (value !== "written" && value !== "race") throw invalidResponse();
  return value;
}

function parseRawPointer(raw: string): EcbMonetaryPolicyActiveEventV1 | null {
  try {
    return parseEcbMonetaryPolicyActiveEventV1(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function samePointer(
  left: EcbMonetaryPolicyActiveEventV1,
  right: EcbMonetaryPolicyActiveEventV1,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function concurrencyConflict(): EcbMonetaryPolicyActiveEventPersistenceError {
  return new EcbMonetaryPolicyActiveEventPersistenceError(
    "concurrency-conflict",
    "ECB active-event pointer changed during compare-and-set.",
  );
}

function invalidResponse(): EcbMonetaryPolicyActiveEventPersistenceError {
  return new EcbMonetaryPolicyActiveEventPersistenceError(
    "invalid-response",
    "Redis returned an invalid ECB active-event response.",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
