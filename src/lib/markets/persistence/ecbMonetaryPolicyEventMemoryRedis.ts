import { Redis } from "@upstash/redis";

import {
  ecbMonetaryPolicyCanonicalEventIdV1,
  type EcbMonetaryPolicyEventFactV1,
} from "../events/ecbMonetaryPolicy";
import {
  advanceEcbMonetaryPolicyEventMemoryV1,
  buildEcbMonetaryPolicyEventSnapshotV1,
  parseEcbMonetaryPolicyEventMemoryV1,
  type AdvanceEcbMonetaryPolicyEventMemoryResultV1,
  type EcbMonetaryPolicyEventMemoryV1,
  type EcbMonetaryPolicyEventSnapshotV1,
} from "../events/ecbMonetaryPolicyMemory";

export type EcbMonetaryPolicyEventMemoryRedisRead = (
  key: string,
) => Promise<unknown>;

export type EcbMonetaryPolicyEventMemoryRedisCompareAndSet = (
  key: string,
  expectedRaw: string | null,
  replacementRaw: string,
) => Promise<unknown>;

export type EcbMonetaryPolicyEventMemoryPersistenceErrorCode =
  | "invalid-current"
  | "redis-failure"
  | "invalid-response"
  | "stored-memory-invalid"
  | "concurrency-conflict";

export class EcbMonetaryPolicyEventMemoryPersistenceError extends Error {
  readonly code: EcbMonetaryPolicyEventMemoryPersistenceErrorCode;

  constructor(
    code: EcbMonetaryPolicyEventMemoryPersistenceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EcbMonetaryPolicyEventMemoryPersistenceError";
    this.code = code;
  }
}

type SuccessfulAdvanceResult = Exclude<
  AdvanceEcbMonetaryPolicyEventMemoryResultV1,
  { readonly status: "event-id-mismatch" }
>;

export type AdvanceEcbMonetaryPolicyEventMemoryRedisResultV1 =
  | SuccessfulAdvanceResult
  | {
      readonly status: "event-id-mismatch";
      readonly expectedCanonicalEventId: string;
      readonly candidateCanonicalEventId: string;
      readonly memory?: EcbMonetaryPolicyEventMemoryV1;
    };

export type ReadEcbMonetaryPolicyEventMemoryRedisResultV1 =
  | { readonly status: "absent" }
  | {
      readonly status: "available";
      readonly memory: EcbMonetaryPolicyEventMemoryV1;
    }
  | { readonly status: "stored-memory-invalid" }
  | { readonly status: "redis-failure" };

export interface EcbMonetaryPolicyEventMemoryRedisAdapterV1 {
  readonly advance: (
    canonicalEventId: string,
    event: EcbMonetaryPolicyEventFactV1,
  ) => Promise<AdvanceEcbMonetaryPolicyEventMemoryRedisResultV1>;
  readonly read: (
    canonicalEventId: string,
  ) => Promise<ReadEcbMonetaryPolicyEventMemoryRedisResultV1>;
}

const KEY_PREFIX =
  "chronoverse:events:ecb-monetary-policy:memory-v1:" as const;
const MAX_CAS_ATTEMPTS = 3;

export function buildEcbMonetaryPolicyEventMemoryRedisKeyV1(
  canonicalEventId: string,
): string {
  assertCanonicalEventId(canonicalEventId);
  return `${KEY_PREFIX}${canonicalEventId}`;
}

/** Domain-agnostic exact-state compare-and-set; all ECB semantics stay in TS. */
const ECB_EVENT_MEMORY_CAS_SCRIPT = String.raw`
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
    throw new EcbMonetaryPolicyEventMemoryPersistenceError(
      "redis-failure",
      "ECB event-memory persistence is not configured.",
    );
  }

  redisClient = new Redis({
    url,
    token,
    automaticDeserialization: false,
  });
  return redisClient;
}

const productionRead: EcbMonetaryPolicyEventMemoryRedisRead = async (key) =>
  getRedisClient().get(key);

const productionCompareAndSet:
EcbMonetaryPolicyEventMemoryRedisCompareAndSet = async (
  key,
  expectedRaw,
  replacementRaw,
) => getRedisClient().eval(
  ECB_EVENT_MEMORY_CAS_SCRIPT,
  [key],
  [expectedRaw === null ? "absent" : "present", expectedRaw ?? "", replacementRaw],
);

export function createEcbMonetaryPolicyEventMemoryRedisAdapterV1(
  dependencies: {
    readonly read: EcbMonetaryPolicyEventMemoryRedisRead;
    readonly compareAndSet: EcbMonetaryPolicyEventMemoryRedisCompareAndSet;
  },
): EcbMonetaryPolicyEventMemoryRedisAdapterV1 {
  return Object.freeze({
    advance: (
      canonicalEventId: string,
      event: EcbMonetaryPolicyEventFactV1,
    ) => advanceWithCas(canonicalEventId, event, dependencies),
    read: (canonicalEventId: string) =>
      readWith(canonicalEventId, dependencies.read),
  });
}

export async function advanceEcbMonetaryPolicyEventMemoryRedisV1(
  canonicalEventId: string,
  event: EcbMonetaryPolicyEventFactV1,
): Promise<AdvanceEcbMonetaryPolicyEventMemoryRedisResultV1> {
  return advanceWithCas(canonicalEventId, event, {
    read: productionRead,
    compareAndSet: productionCompareAndSet,
  });
}

export async function readEcbMonetaryPolicyEventMemoryV1(
  canonicalEventId: string,
): Promise<ReadEcbMonetaryPolicyEventMemoryRedisResultV1> {
  return readWith(canonicalEventId, productionRead);
}

async function advanceWithCas(
  canonicalEventId: string,
  event: EcbMonetaryPolicyEventFactV1,
  dependencies: {
    readonly read: EcbMonetaryPolicyEventMemoryRedisRead;
    readonly compareAndSet: EcbMonetaryPolicyEventMemoryRedisCompareAndSet;
  },
): Promise<AdvanceEcbMonetaryPolicyEventMemoryRedisResultV1> {
  let key: string;
  let candidate: EcbMonetaryPolicyEventSnapshotV1;

  try {
    key = buildEcbMonetaryPolicyEventMemoryRedisKeyV1(canonicalEventId);
    candidate = parseCandidate(event);
  } catch {
    throw new EcbMonetaryPolicyEventMemoryPersistenceError(
      "invalid-current",
      "Current ECB monetary-policy event or canonical identity is invalid.",
    );
  }

  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const currentRaw = await readRawForAdvance(key, dependencies.read);

    if (currentRaw === null) {
      if (candidate.canonicalEventId !== canonicalEventId) {
        return mismatch(canonicalEventId, candidate.canonicalEventId);
      }

      const initialized = advanceEcbMonetaryPolicyEventMemoryV1(
        null,
        candidate.event,
      );
      if (initialized.status !== "initialized") throw invalidResponse();
      const replacementRaw = serializeValidatedMemory(initialized.memory);
      const cas = await compareAndSet(
        key,
        null,
        replacementRaw,
        dependencies.compareAndSet,
      );
      if (cas === "race") continue;
      validateWrittenReplacement(replacementRaw, initialized.memory);
      return initialized;
    }

    const currentMemory = parseStoredMemory(currentRaw, canonicalEventId);
    const result = advanceEcbMonetaryPolicyEventMemoryV1(
      currentMemory,
      candidate.event,
    );

    if (result.status !== "advanced") {
      return result;
    }

    const replacementRaw = serializeValidatedMemory(result.memory);
    const cas = await compareAndSet(
      key,
      currentRaw,
      replacementRaw,
      dependencies.compareAndSet,
    );
    if (cas === "race") continue;
    validateWrittenReplacement(replacementRaw, result.memory);
    return result;
  }

  throw new EcbMonetaryPolicyEventMemoryPersistenceError(
    "concurrency-conflict",
    "ECB event-memory compare-and-set retry limit was exhausted.",
  );
}

function parseCandidate(
  event: EcbMonetaryPolicyEventFactV1,
): EcbMonetaryPolicyEventSnapshotV1 {
  const built = buildEcbMonetaryPolicyEventSnapshotV1(event);
  const memory = parseEcbMonetaryPolicyEventMemoryV1({
    schemaVersion: "ecb-monetary-policy-event-memory-v1",
    canonicalEventId: built.canonicalEventId,
    snapshots: [built],
  });
  if (memory === null) throw new TypeError("Invalid ECB event candidate.");
  return memory.snapshots[0]!;
}

async function readRawForAdvance(
  key: string,
  read: EcbMonetaryPolicyEventMemoryRedisRead,
): Promise<string | null> {
  let value: unknown;
  try {
    value = await read(key);
  } catch {
    throw new EcbMonetaryPolicyEventMemoryPersistenceError(
      "redis-failure",
      "Reading ECB event memory from Redis failed.",
    );
  }

  if (value === null) return null;
  if (typeof value !== "string") throw invalidResponse();
  return value;
}

async function compareAndSet(
  key: string,
  expectedRaw: string | null,
  replacementRaw: string,
  compare: EcbMonetaryPolicyEventMemoryRedisCompareAndSet,
): Promise<"written" | "race"> {
  let value: unknown;
  try {
    value = await compare(key, expectedRaw, replacementRaw);
  } catch {
    throw new EcbMonetaryPolicyEventMemoryPersistenceError(
      "redis-failure",
      "Atomic ECB event-memory compare-and-set failed.",
    );
  }

  if (value !== "written" && value !== "race") throw invalidResponse();
  return value;
}

function parseStoredMemory(
  raw: string,
  canonicalEventId: string,
): EcbMonetaryPolicyEventMemoryV1 {
  const memory = parseRedisMemory(raw);
  if (memory === null || memory.canonicalEventId !== canonicalEventId) {
    throw new EcbMonetaryPolicyEventMemoryPersistenceError(
      "stored-memory-invalid",
      "Stored ECB event memory is invalid and was not overwritten.",
    );
  }
  return memory;
}

function serializeValidatedMemory(
  memory: EcbMonetaryPolicyEventMemoryV1,
): string {
  const serialized = JSON.stringify(memory);
  if (parseRedisMemory(serialized) === null) throw invalidResponse();
  return serialized;
}

function validateWrittenReplacement(
  raw: string,
  expected: EcbMonetaryPolicyEventMemoryV1,
): void {
  const parsed = parseRedisMemory(raw);
  if (parsed === null || !sameMemory(parsed, expected)) throw invalidResponse();
}

async function readWith(
  canonicalEventId: string,
  read: EcbMonetaryPolicyEventMemoryRedisRead,
): Promise<ReadEcbMonetaryPolicyEventMemoryRedisResultV1> {
  let key: string;
  try {
    key = buildEcbMonetaryPolicyEventMemoryRedisKeyV1(canonicalEventId);
  } catch {
    return Object.freeze({ status: "stored-memory-invalid" });
  }

  let value: unknown;
  try {
    value = await read(key);
  } catch {
    return Object.freeze({ status: "redis-failure" });
  }

  if (value === null) return Object.freeze({ status: "absent" });
  if (typeof value !== "string") {
    return Object.freeze({ status: "stored-memory-invalid" });
  }

  const memory = parseRedisMemory(value);
  if (memory === null || memory.canonicalEventId !== canonicalEventId) {
    return Object.freeze({ status: "stored-memory-invalid" });
  }
  return Object.freeze({ status: "available", memory });
}

function parseRedisMemory(value: string): EcbMonetaryPolicyEventMemoryV1 | null {
  try {
    return parseEcbMonetaryPolicyEventMemoryV1(JSON.parse(value) as unknown);
  } catch {
    return null;
  }
}

function assertCanonicalEventId(canonicalEventId: string): void {
  const match = /^ECB:ecb-monetary-policy-decision:(\d{4}-\d{2}-\d{2})$/
    .exec(canonicalEventId);
  if (
    match === null ||
    ecbMonetaryPolicyCanonicalEventIdV1(match[1]!) !== canonicalEventId
  ) {
    throw new TypeError("Invalid ECB canonical event identity.");
  }
}

function mismatch(
  expectedCanonicalEventId: string,
  candidateCanonicalEventId: string,
): AdvanceEcbMonetaryPolicyEventMemoryRedisResultV1 {
  return Object.freeze({
    status: "event-id-mismatch",
    expectedCanonicalEventId,
    candidateCanonicalEventId,
  });
}

function sameMemory(
  left: EcbMonetaryPolicyEventMemoryV1,
  right: EcbMonetaryPolicyEventMemoryV1,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function invalidResponse(): EcbMonetaryPolicyEventMemoryPersistenceError {
  return new EcbMonetaryPolicyEventMemoryPersistenceError(
    "invalid-response",
    "Redis returned an invalid ECB event-memory response.",
  );
}
