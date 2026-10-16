import { types } from "node:util";
import { ecbMonetaryPolicyCanonicalEventIdV1 } from "../events/ecbMonetaryPolicy";

export const ECB_MONETARY_POLICY_OWNERSHIP_LEDGER_SCHEMA_VERSION_V1 =
  "ecb-monetary-policy-ownership-ledger-v1" as const;
export const ECB_MONETARY_POLICY_OWNERSHIP_LEDGER_REDIS_KEY_V1 =
  "chronoverse:events:ecb-monetary-policy:ownership-ledger-v1" as const;

export interface EcbMonetaryPolicyOwnershipAppendV1 {
  /** Stable operation identity, retained verbatim for every retry. */
  readonly transitionId: string;
  readonly expectedHeadTransitionId: string | null;
  readonly canonicalEventId: string;
  /** Identity date, never a rescheduled meeting date. */
  readonly canonicalMeetingDate: string;
  /** Integer UTC milliseconds in [0, last millisecond of year 9999].
   * Must be >= ceil(Redis TIME in milliseconds) at atomic admission. */
  readonly effectiveAt: number;
}

export interface EcbMonetaryPolicyOwnershipTransitionV1 {
  readonly schemaVersion: typeof ECB_MONETARY_POLICY_OWNERSHIP_LEDGER_SCHEMA_VERSION_V1;
  readonly transitionId: string;
  readonly previousTransitionId: string | null;
  readonly sequence: number;
  readonly fromCanonicalEventId: string | null;
  readonly canonicalEventId: string;
  readonly canonicalMeetingDate: string;
  readonly effectiveAt: number;
  /** Floor of Redis TIME in milliseconds, sampled inside the atomic append.
   * A millisecond bucket, not evidence availability or a durability receipt.
   * Prospectivity uses the unrounded sample's ceiling, never this floor. */
  readonly recordedAt: number;
  readonly recordedAtSource: "redis-time";
}

export type EcbMonetaryPolicyOwnershipLedgerErrorCode =
  | "invalid-transition"
  | "stored-ledger-invalid"
  | "redis-failure"
  | "invalid-response"
  | "concurrency-conflict"
  | "conflicting-duplicate"
  | "backdated-transition"
  | "clock-regression";

export class EcbMonetaryPolicyOwnershipLedgerPersistenceError extends Error {
  constructor(
    readonly code: EcbMonetaryPolicyOwnershipLedgerErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EcbMonetaryPolicyOwnershipLedgerPersistenceError";
  }
}

/**
 * Trusted transport boundary: read must execute LRANGE key 0 -1 and eval must
 * execute the supplied script unchanged, on the same Redis authority. No clock
 * or recordedAt is accepted from the caller. Tests inject a local transport.
 * An Upstash client with automaticDeserialization:false can supply these calls.
 */
export interface EcbMonetaryPolicyOwnershipLedgerRedisTransportV1 {
  readonly read: (key: string) => Promise<unknown>;
  readonly eval: (script: string, keys: string[], args: string[]) => Promise<unknown>;
}

export type ReadEcbMonetaryPolicyOwnershipLedgerRedisResultV1 =
  | { readonly status: "absent" }
  | { readonly status: "available"; readonly transitions: readonly EcbMonetaryPolicyOwnershipTransitionV1[] }
  | { readonly status: "stored-ledger-invalid" }
  | { readonly status: "redis-failure" };

export interface EcbMonetaryPolicyOwnershipLedgerRedisAdapterV1 {
  readonly read: () => Promise<ReadEcbMonetaryPolicyOwnershipLedgerRedisResultV1>;
  readonly append: (input: EcbMonetaryPolicyOwnershipAppendV1) => Promise<{
    readonly status: "appended" | "unchanged";
    readonly transition: EcbMonetaryPolicyOwnershipTransitionV1;
  }>;
}

/**
 * Compare every immutable raw entry, then stamp and RPUSH once. There are no
 * writes before all checks/serialization complete: Lua errors do not roll back
 * earlier writes. Existing entries are never reserialized, replaced or expired.
 * Effects replication permits TIME followed by a write on older Redis versions.
 */
const APPEND_SCRIPT = String.raw`
redis.replicate_commands()
local expected = cjson.decode(ARGV[1])
local current = redis.call("LRANGE", KEYS[1], 0, -1)
if #current ~= #expected then return {"race"} end
for i = 1, #current do
  if current[i] ~= expected[i] then return {"race"} end
end
local time = redis.call("TIME")
local seconds = tonumber(time[1])
local micros = tonumber(time[2])
if not seconds or not micros or seconds < 0 or seconds > 253402300799 or seconds ~= math.floor(seconds)
  or micros < 0 or micros >= 1000000 or micros ~= math.floor(micros) then
  return {"invalid-time"}
end
local recorded_at = seconds * 1000 + math.floor(micros / 1000)
local admission_at = recorded_at
if micros % 1000 ~= 0 then admission_at = admission_at + 1 end
if admission_at > 253402300799999 then return {"invalid-time"} end
if recorded_at < tonumber(ARGV[4]) then return {"clock-regression"} end
if admission_at > tonumber(ARGV[3]) then return {"backdated-transition"} end
local raw = string.sub(ARGV[2], 1, -2)
  .. ',"recordedAt":' .. string.format("%.0f", recorded_at) .. '}'
redis.call("RPUSH", KEYS[1], raw)
return {"appended", raw}
`;

/**
 * Isolated, forward-only ownership persistence. The first transition proves
 * ownership only from its explicit effectiveAt; absence proves no past owner.
 * This API cannot backfill from schedules, active pointers or event memory.
 * Atomicity covers this ledger alone, never the live active-event pointer.
 * Redis credentials, retention, clock synchronization and durability remain
 * the transport operator's responsibility. Reads/appends are O(history size).
 */
export function createEcbMonetaryPolicyOwnershipLedgerRedisAdapterV1(
  transport: EcbMonetaryPolicyOwnershipLedgerRedisTransportV1,
): EcbMonetaryPolicyOwnershipLedgerRedisAdapterV1 {
  // Capture dependencies so replacing a transport property cannot change authority.
  const dependencies = Object.freeze({ read: transport.read, eval: transport.eval });
  return Object.freeze({
    read: () => readWith(dependencies),
    append: (input: EcbMonetaryPolicyOwnershipAppendV1) => appendWith(input, dependencies),
  });
}

const INPUT_KEYS = "canonicalEventId,canonicalMeetingDate,effectiveAt,expectedHeadTransitionId,transitionId";
const RECORD_KEYS = "canonicalEventId,canonicalMeetingDate,effectiveAt,fromCanonicalEventId,previousTransitionId,recordedAt,recordedAtSource,schemaVersion,sequence,transitionId";
const MAX_ATTEMPTS = 3;
const MAX_MS = 253_402_300_799_999; // Canonical temporal contract: UTC year 9999.
const isProxy = types.isProxy;

function parseInput(original: unknown): EcbMonetaryPolicyOwnershipAppendV1 | null {
  try {
    const value = snapshotRecord(original, INPUT_KEYS);
    if (value === null || !validId(value.transitionId) ||
      !(value.expectedHeadTransitionId === null || validId(value.expectedHeadTransitionId)) ||
      value.transitionId === value.expectedHeadTransitionId ||
      !validInstant(value.effectiveAt) || !validIdentity(value)) return null;
    return Object.freeze({
      transitionId: value.transitionId,
      expectedHeadTransitionId: value.expectedHeadTransitionId,
      canonicalEventId: value.canonicalEventId as string,
      canonicalMeetingDate: value.canonicalMeetingDate as string,
      effectiveAt: value.effectiveAt,
    });
  } catch { return null; }
}

function parseTransition(original: unknown): EcbMonetaryPolicyOwnershipTransitionV1 | null {
  try {
    const value = snapshotRecord(original, RECORD_KEYS);
    if (value === null ||
      value.schemaVersion !== ECB_MONETARY_POLICY_OWNERSHIP_LEDGER_SCHEMA_VERSION_V1 ||
      value.recordedAtSource !== "redis-time" ||
      !validId(value.transitionId) ||
      !(value.previousTransitionId === null || validId(value.previousTransitionId)) ||
      !Number.isSafeInteger(value.sequence) || (value.sequence as number) < 1 ||
      !(value.fromCanonicalEventId === null || validCanonicalId(value.fromCanonicalEventId)) ||
      !validInstant(value.effectiveAt) || !validInstant(value.recordedAt) ||
      value.recordedAt > value.effectiveAt || !validIdentity(value)) return null;
    return Object.freeze({
      schemaVersion: ECB_MONETARY_POLICY_OWNERSHIP_LEDGER_SCHEMA_VERSION_V1,
      transitionId: value.transitionId,
      previousTransitionId: value.previousTransitionId,
      sequence: value.sequence as number,
      fromCanonicalEventId: value.fromCanonicalEventId,
      canonicalEventId: value.canonicalEventId as string,
      canonicalMeetingDate: value.canonicalMeetingDate as string,
      effectiveAt: value.effectiveAt,
      recordedAt: value.recordedAt,
      recordedAtSource: "redis-time",
    });
  } catch { return null; }
}

function parseLedger(raw: readonly string[] | null): readonly EcbMonetaryPolicyOwnershipTransitionV1[] | null {
  try {
    if (raw === null) return null;
    const transitions: EcbMonetaryPolicyOwnershipTransitionV1[] = [];
    const ids = new Set<string>();
    for (const entry of raw) {
      if (typeof entry !== "string") return null;
      const record = parseTransition(JSON.parse(entry) as unknown);
      const previous = transitions.at(-1);
      if (record === null || ids.has(record.transitionId) ||
        record.sequence !== transitions.length + 1 ||
        record.previousTransitionId !== (previous?.transitionId ?? null) ||
        record.fromCanonicalEventId !== (previous?.canonicalEventId ?? null) ||
        (previous !== undefined && (record.effectiveAt <= previous.effectiveAt ||
          record.recordedAt < previous.recordedAt || record.canonicalEventId === previous.canonicalEventId))) return null;
      ids.add(record.transitionId);
      transitions.push(record);
    }
    return Object.freeze(transitions);
  } catch { return null; }
}

async function readRaw(transport: EcbMonetaryPolicyOwnershipLedgerRedisTransportV1): Promise<readonly string[] | null> {
  let raw: unknown;
  try { raw = await transport.read(ECB_MONETARY_POLICY_OWNERSHIP_LEDGER_REDIS_KEY_V1); }
  catch { throw failure("redis-failure"); }
  return snapshotStrings(raw);
}

async function readWith(
  transport: EcbMonetaryPolicyOwnershipLedgerRedisTransportV1,
): Promise<ReadEcbMonetaryPolicyOwnershipLedgerRedisResultV1> {
  let raw: readonly string[] | null;
  try { raw = await readRaw(transport); }
  catch { return Object.freeze({ status: "redis-failure" }); }
  const transitions = parseLedger(raw);
  if (transitions === null) return Object.freeze({ status: "stored-ledger-invalid" });
  return transitions.length === 0 ? Object.freeze({ status: "absent" }) :
    Object.freeze({ status: "available", transitions });
}

async function appendWith(
  value: EcbMonetaryPolicyOwnershipAppendV1,
  transport: EcbMonetaryPolicyOwnershipLedgerRedisTransportV1,
): ReturnType<EcbMonetaryPolicyOwnershipLedgerRedisAdapterV1["append"]> {
  const input = parseInput(value);
  if (input === null) throw failure("invalid-transition");
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const raw = await readRaw(transport);
    const transitions = parseLedger(raw);
    if (transitions === null) throw failure("stored-ledger-invalid");
    const duplicate = transitions.find((record) => record.transitionId === input.transitionId);
    if (duplicate !== undefined) {
      if (!matchesInput(duplicate, input)) throw failure("conflicting-duplicate");
      return Object.freeze({ status: "unchanged", transition: duplicate });
    }
    const head = transitions.at(-1);
    if (input.expectedHeadTransitionId !== (head?.transitionId ?? null)) throw failure("concurrency-conflict");
    if (head !== undefined && (input.effectiveAt <= head.effectiveAt ||
      input.canonicalEventId === head.canonicalEventId)) throw failure("invalid-transition");
    const candidate = {
      schemaVersion: ECB_MONETARY_POLICY_OWNERSHIP_LEDGER_SCHEMA_VERSION_V1,
      transitionId: input.transitionId,
      previousTransitionId: input.expectedHeadTransitionId,
      sequence: transitions.length + 1,
      fromCanonicalEventId: head?.canonicalEventId ?? null,
      canonicalEventId: input.canonicalEventId,
      canonicalMeetingDate: input.canonicalMeetingDate,
      effectiveAt: input.effectiveAt,
      recordedAtSource: "redis-time",
    };
    let received: unknown;
    try {
      received = await transport.eval(APPEND_SCRIPT,
        [ECB_MONETARY_POLICY_OWNERSHIP_LEDGER_REDIS_KEY_V1],
        [JSON.stringify(raw), JSON.stringify(candidate), String(input.effectiveAt), String(head?.recordedAt ?? 0)]);
    } catch { throw failure("redis-failure"); }
    const response = snapshotStrings(received);
    if (response === null) throw failure("invalid-response");
    if (response.length === 1) {
      if (response[0] === "race") continue;
      if (response[0] === "backdated-transition" || response[0] === "clock-regression") throw failure(response[0]);
      throw failure("invalid-response");
    }
    if (response.length !== 2 || response[0] !== "appended" || typeof response[1] !== "string") throw failure("invalid-response");
    const extended = parseLedger([...(raw as readonly string[]), response[1]]);
    const appended = extended?.at(-1);
    if (appended === undefined || !matchesInput(appended, input)) throw failure("invalid-response");
    return Object.freeze({ status: "appended", transition: appended });
  }
  throw failure("concurrency-conflict");
}

function matchesInput(record: EcbMonetaryPolicyOwnershipTransitionV1, input: EcbMonetaryPolicyOwnershipAppendV1): boolean {
  return record.transitionId === input.transitionId && record.previousTransitionId === input.expectedHeadTransitionId &&
    record.canonicalEventId === input.canonicalEventId && record.canonicalMeetingDate === input.canonicalMeetingDate &&
    record.effectiveAt === input.effectiveAt;
}

/** Inspect once without executing caller code; validate only detached data.
 * Reject proxies before reflection (including revoked proxies), accessors,
 * symbols, hidden/extra keys, exotic prototypes and non-primitive leaves. */
function snapshotRecord(value: unknown, keys: string): Readonly<Record<string, unknown>> | null {
  if (typeof value !== "object" || value === null || isProxy(value) || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== keys.split(",").length ||
    Object.keys(descriptors).sort().join(",") !== keys) return null;
  const snapshot: Record<string, unknown> = Object.create(null);
  for (const key of keys.split(",")) {
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !("value" in descriptor)) return null;
    const leaf: unknown = descriptor.value;
    if (leaf !== null && typeof leaf !== "string" && typeof leaf !== "number") return null;
    snapshot[key] = leaf;
  }
  return Object.freeze(snapshot);
}

/** LRANGE/EVAL wire values must be ordinary dense arrays of primitive strings.
 * Copy before validation/awaits so shared transport arrays cannot alter the CAS. */
function snapshotStrings(value: unknown): readonly string[] | null {
  try {
    if (typeof value !== "object" || value === null || isProxy(value) ||
      !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value as object);
    const length: unknown = descriptors.length.value;
    if (typeof length !== "number" || Reflect.ownKeys(descriptors).length !== length + 1) return null;
    const snapshot: string[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor) ||
        typeof descriptor.value !== "string") return null;
      snapshot.push(descriptor.value);
    }
    return Object.freeze(snapshot);
  } catch { return null; }
}

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value);
}

function validInstant(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && !Object.is(value, -0) && value >= 0 && value <= MAX_MS;
}

function validIdentity(value: Record<string, unknown>): boolean {
  return typeof value.canonicalMeetingDate === "string" && typeof value.canonicalEventId === "string" &&
    ecbMonetaryPolicyCanonicalEventIdV1(value.canonicalMeetingDate) === value.canonicalEventId;
}

function validCanonicalId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^ECB:ecb-monetary-policy-decision:(\d{4}-\d{2}-\d{2})$/.exec(value);
  return match !== null && ecbMonetaryPolicyCanonicalEventIdV1(match[1]) === value;
}

function failure(code: EcbMonetaryPolicyOwnershipLedgerErrorCode): EcbMonetaryPolicyOwnershipLedgerPersistenceError {
  return new EcbMonetaryPolicyOwnershipLedgerPersistenceError(code, `ECB ownership ledger: ${code}.`);
}
