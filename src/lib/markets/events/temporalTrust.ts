import { types } from "node:util";
import { parseEventInstantV1 } from "./eventClock";

/**
 * Pure temporal arithmetic, not an evidence admission or authentication API.
 * Owner assertions describe prerequisites that the calling authority must verify
 * independently. Copies, labels, hashes and serialized values confer no trust.
 * Millisecond representation does not establish wall-clock accuracy.
 */
export const TEMPORAL_TRUST_SCHEMA_VERSION_V1 = "temporal-trust-v1" as const;
const MAX_MS = 253_402_300_799_999; // Last millisecond of UTC year 9999.
const DAY_MS = 86_400_000;
const MAX_REQUIRED_COMPONENTS = 1_024;
// Capture pure native inspection functions; no global state is changed.
const isProxy = types.isProxy;
const ordinaryArrayPrototype = Array.prototype;
const ordinaryArrayIterator = Object.getOwnPropertyDescriptor(ordinaryArrayPrototype, Symbol.iterator)?.value;
// Type-only construction discipline; this is not a receipt or authority brand.
declare const validatedTemporalValue: unique symbol;

export type TemporalInstantInputV1 =
  | { readonly unit: "epoch-milliseconds"; readonly value: number }
  | { readonly unit: "offset-iso"; readonly value: string };
export type TemporalInstantKindV1 = "acquisition-completion" | "evidence-availability"
  | "evaluation" | "historical-cutoff" | "qualified-publication";
export type TemporalInstantV1<K extends TemporalInstantKindV1> = Readonly<{
  schemaVersion: typeof TEMPORAL_TRUST_SCHEMA_VERSION_V1;
  kind: K;
  unit: "epoch-milliseconds";
  precision: "millisecond";
  epochMilliseconds: number;
  iso: string;
  readonly [validatedTemporalValue]: K;
}>;
export type AcquisitionCompletionV1 = TemporalInstantV1<"acquisition-completion">;
export type EvidenceAvailabilityV1 = TemporalInstantV1<"evidence-availability"> & Readonly<{
  acquisitionCompletedAtMs: number;
}>;
export type EvaluationInstantV1 = TemporalInstantV1<"evaluation">;
export type HistoricalCutoffV1 = TemporalInstantV1<"historical-cutoff"> & Readonly<{
  evaluatedAtMs: number;
}>;
export type QualifiedPublicationInstantV1 = TemporalInstantV1<"qualified-publication">;
export type TemporalCutoffV1 = EvaluationInstantV1 | HistoricalCutoffV1;

/** Descriptive classification only; this module cannot authenticate its assertion. */
export type OwnerProvenanceClassificationV1 =
  | "owner-asserted-authenticated" | "unavailable";
export type ClockAccuracyInputV1 =
  | { readonly status: "unknown" }
  | { readonly status: "bounded"; readonly unit: "milliseconds";
      readonly maximumAbsoluteError: number;
      readonly provenance: OwnerProvenanceClassificationV1 };
export type ClockAccuracyV1 = Readonly<ClockAccuracyInputV1 & {
  schemaVersion: typeof TEMPORAL_TRUST_SCHEMA_VERSION_V1;
  kind: "clock-accuracy";
  readonly [validatedTemporalValue]: "clock-accuracy";
}>;

export type LegacyAcquisitionBucketV1 = Readonly<{
  schemaVersion: typeof TEMPORAL_TRUST_SCHEMA_VERSION_V1;
  kind: "legacy-acquisition-bucket";
  unit: "epoch-milliseconds";
  precision: "second-bucket";
  legacyEpochSecond: number;
  startMs: number;
  endExclusiveMs: number;
  acquisitionProvenance: OwnerProvenanceClassificationV1;
  readonly [validatedTemporalValue]: "legacy-acquisition-bucket";
}>;
export type PublicationCivilDateConstraintV1 = Readonly<{
  schemaVersion: typeof TEMPORAL_TRUST_SCHEMA_VERSION_V1;
  kind: "publication-civil-date-constraint";
  precision: "civil-date";
  date: string;
  /** An explicit owner-qualified offset for this date, not an inferred timezone. */
  utcOffsetMinutes: number | null;
  readonly [validatedTemporalValue]: "publication-civil-date-constraint";
}>;

type UnavailableReasonV1 = "acquisition-provenance-unavailable"
  | "clock-provenance-unavailable" | "clock-uncertainty-unavailable"
  | "component-bound-unavailable";
type BoundDataV1 =
  | { readonly status: "bounded"; readonly notBeforeEpochMilliseconds: number }
  | { readonly status: "unavailable"; readonly reason: UnavailableReasonV1 };
export type AvailabilityBoundV1 = Readonly<BoundDataV1 & {
  schemaVersion: typeof TEMPORAL_TRUST_SCHEMA_VERSION_V1;
  kind: "availability-bound";
  unit: "epoch-milliseconds";
  authentication: "not-performed";
  readonly [validatedTemporalValue]: "availability-bound";
}>;
export type TemporalComparisonV1 = Readonly<{
  schemaVersion: typeof TEMPORAL_TRUST_SCHEMA_VERSION_V1;
  scope: "temporal-comparison-only";
  status: "satisfied" | "not-satisfied" | "unavailable";
  authentication: "not-performed";
  evidenceAdmission: "not-certified";
}>;

export function createAcquisitionCompletionV1(input: TemporalInstantInputV1): AcquisitionCompletionV1 {
  return instant("acquisition-completion", input);
}
export function createEvaluationInstantV1(input: TemporalInstantInputV1): EvaluationInstantV1 {
  return instant("evaluation", input);
}
export function createEvidenceAvailabilityV1(input: {
  readonly completion: AcquisitionCompletionV1; readonly at: TemporalInstantInputV1;
}): EvidenceAvailabilityV1 {
  const data = closed(input, ["completion", "at"]);
  const completion = readInstant(data.completion, ["acquisition-completion"]);
  const availability = instant("evidence-availability", data.at);
  if (availability.epochMilliseconds < completion.epochMilliseconds) {
    throw new RangeError("Availability precedes acquisition completion.");
  }
  return Object.freeze({ ...availability, acquisitionCompletedAtMs: completion.epochMilliseconds });
}
export function createHistoricalCutoffV1(input: {
  readonly evaluation: EvaluationInstantV1; readonly at: TemporalInstantInputV1;
}): HistoricalCutoffV1 {
  const data = closed(input, ["evaluation", "at"]);
  const evaluation = readInstant(data.evaluation, ["evaluation"]);
  const cutoff = instant("historical-cutoff", data.at);
  if (cutoff.epochMilliseconds > evaluation.epochMilliseconds) {
    throw new RangeError("Historical cutoff follows evaluation.");
  }
  return Object.freeze({ ...cutoff, evaluatedAtMs: evaluation.epochMilliseconds });
}
/** The qualification is an owner assertion, never verification by this module. */
export function createQualifiedPublicationInstantV1(input: {
  readonly at: TemporalInstantInputV1;
  readonly sourceQualification: "owner-asserted-qualified";
}): QualifiedPublicationInstantV1 {
  const data = closed(input, ["at", "sourceQualification"]);
  if (data.sourceQualification !== "owner-asserted-qualified") {
    throw new TypeError("Publication source qualification is required.");
  }
  return instant("qualified-publication", data.at);
}

export function createClockAccuracyV1(input: ClockAccuracyInputV1): ClockAccuracyV1 {
  const initial = closedVariant(input, "status", {
    unknown: ["status"], bounded: ["status", "unit", "maximumAbsoluteError", "provenance"],
  });
  if (initial.status === "unknown") {
    return Object.freeze({ schemaVersion: TEMPORAL_TRUST_SCHEMA_VERSION_V1,
      kind: "clock-accuracy", status: "unknown" }) as ClockAccuracyV1;
  }
  if (initial.unit !== "milliseconds") throw new TypeError("Clock error must use milliseconds.");
  const maximumAbsoluteError = milliseconds(initial.maximumAbsoluteError);
  const provenance = classification(initial.provenance);
  return Object.freeze({ schemaVersion: TEMPORAL_TRUST_SCHEMA_VERSION_V1,
    kind: "clock-accuracy", status: "bounded", unit: "milliseconds",
    maximumAbsoluteError, provenance }) as ClockAccuracyV1;
}

export function createLegacyAcquisitionBucketV1(input: {
  readonly unit: "epoch-seconds"; readonly value: number;
  readonly acquisitionProvenance: OwnerProvenanceClassificationV1;
}): LegacyAcquisitionBucketV1 {
  const data = closed(input, ["unit", "value", "acquisitionProvenance"]);
  if (data.unit !== "epoch-seconds" || typeof data.value !== "number" ||
      !Number.isSafeInteger(data.value) || data.value < 0 || Object.is(data.value, -0)) {
    throw new TypeError("Expected a nonnegative integral legacy epoch second.");
  }
  const acquisitionProvenance = classification(data.acquisitionProvenance);
  const startMs = milliseconds(data.value * 1_000);
  // Reject an exclusive end outside the supported domain instead of clamping it.
  const endExclusiveMs = milliseconds((data.value + 1) * 1_000);
  return Object.freeze({ schemaVersion: TEMPORAL_TRUST_SCHEMA_VERSION_V1,
    kind: "legacy-acquisition-bucket", unit: "epoch-milliseconds",
    precision: "second-bucket", legacyEpochSecond: data.value, startMs,
    endExclusiveMs, acquisitionProvenance }) as LegacyAcquisitionBucketV1;
}

export function createPublicationCivilDateConstraintV1(input: {
  readonly date: string; readonly utcOffsetMinutes: number | null;
}): PublicationCivilDateConstraintV1 {
  const data = closed(input, ["date", "utcOffsetMinutes"]);
  if (typeof data.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    throw new TypeError("Expected a publication civil date.");
  }
  // Midnight here validates the calendar only; it is not a release or possession claim.
  parseEventInstantV1(data.date + "T00:00:00Z", "publication date");
  const offset = data.utcOffsetMinutes;
  if (offset !== null && (typeof offset !== "number" || !Number.isSafeInteger(offset) ||
      Math.abs(offset) > 14 * 60 || Object.is(offset, -0))) {
    throw new TypeError("Expected an explicit qualified UTC offset or null.");
  }
  return Object.freeze({ schemaVersion: TEMPORAL_TRUST_SCHEMA_VERSION_V1,
    kind: "publication-civil-date-constraint", precision: "civil-date",
    date: data.date, utcOffsetMinutes: offset }) as PublicationCivilDateConstraintV1;
}

/** Source qualification remains the owner's responsibility, even when this comparison satisfies. */
export function compareQualifiedPublicationAsOfV1(input: {
  readonly publication: QualifiedPublicationInstantV1;
  readonly at: AcquisitionCompletionV1 | TemporalCutoffV1;
}): TemporalComparisonV1 {
  const data = closed(input, ["publication", "at"]);
  const published = readInstant(data.publication, ["qualified-publication"]);
  const at = readInstant(data.at, ["acquisition-completion", "evaluation", "historical-cutoff"]);
  return comparison(published.epochMilliseconds <= at.epochMilliseconds ? "satisfied" : "not-satisfied");
}

/**
 * Only tests an explicitly qualified civil-date lower bound. Unknown timezone
 * stays unavailable; even satisfaction is not proof of an exact release instant.
 */
export function comparePublicationCivilDateV1(input: {
  readonly constraint: PublicationCivilDateConstraintV1;
  readonly instant: AcquisitionCompletionV1 | TemporalCutoffV1;
}): TemporalComparisonV1 {
  const data = closed(input, ["constraint", "instant"]);
  const raw = closed(data.constraint, ["schemaVersion", "kind", "precision", "date", "utcOffsetMinutes"]);
  constants(raw, { schemaVersion: TEMPORAL_TRUST_SCHEMA_VERSION_V1,
    kind: "publication-civil-date-constraint", precision: "civil-date" });
  const constraint = createPublicationCivilDateConstraintV1({
    date: raw.date as string, utcOffsetMinutes: raw.utcOffsetMinutes as number | null,
  });
  const at = readInstant(data.instant, ["acquisition-completion", "evaluation", "historical-cutoff"]);
  if (constraint.utcOffsetMinutes === null) return comparison("unavailable");
  const interval = civilDayInterval(
    parseEventInstantV1(constraint.date + "T00:00:00Z", "publication date"),
    constraint.utcOffsetMinutes,
  );
  // This is a lower-bound constraint: the next day also satisfies it. The
  // signed internal interval is not an acquisition instant or a release claim.
  return comparison(at.epochMilliseconds >= interval.startMs ? "satisfied" : "not-satisfied");
}

export function buildAvailabilityBoundV1(input: {
  readonly availability: EvidenceAvailabilityV1;
  readonly acquisitionProvenance: OwnerProvenanceClassificationV1;
  readonly clockAccuracy: ClockAccuracyV1;
}): AvailabilityBoundV1 {
  const data = closed(input, ["availability", "acquisitionProvenance", "clockAccuracy"]);
  const at = readInstant(data.availability, ["evidence-availability"]);
  const provenance = classification(data.acquisitionProvenance);
  const accuracy = readAccuracy(data.clockAccuracy);
  const failure = accuracyFailure(provenance, accuracy);
  if (failure !== null) return unavailableBound(failure);
  if (accuracy.status !== "bounded") throw new TypeError("Expected bounded accuracy.");
  return freezeBound(at.epochMilliseconds + accuracy.maximumAbsoluteError);
}

export function buildLegacyAvailabilityBoundV1(input: {
  readonly bucket: LegacyAcquisitionBucketV1; readonly clockAccuracy: ClockAccuracyV1;
}): AvailabilityBoundV1 {
  const data = closed(input, ["bucket", "clockAccuracy"]);
  const raw = closed(data.bucket, ["schemaVersion", "kind", "unit", "precision",
    "legacyEpochSecond", "startMs", "endExclusiveMs", "acquisitionProvenance"]);
  constants(raw, { schemaVersion: TEMPORAL_TRUST_SCHEMA_VERSION_V1,
    kind: "legacy-acquisition-bucket", unit: "epoch-milliseconds", precision: "second-bucket" });
  const bucket = createLegacyAcquisitionBucketV1({ unit: "epoch-seconds",
    value: raw.legacyEpochSecond as number,
    acquisitionProvenance: raw.acquisitionProvenance as OwnerProvenanceClassificationV1 });
  if (raw.startMs !== bucket.startMs || raw.endExclusiveMs !== bucket.endExclusiveMs) {
    throw new TypeError("Legacy bounds disagree with the recorded second.");
  }
  const accuracy = readAccuracy(data.clockAccuracy);
  const failure = accuracyFailure(bucket.acquisitionProvenance, accuracy);
  if (failure !== null) return unavailableBound(failure);
  if (accuracy.status !== "bounded") throw new TypeError("Expected bounded accuracy.");
  const error = accuracy.maximumAbsoluteError;
  return freezeBound(bucket.endExclusiveMs + error);
}

/**
 * Latest of every required component; unknown components cannot be omitted.
 * Supports current-realm ordinary dense arrays of 1..1024 own data entries.
 * Freezing caller data alone neither sanitizes it nor authenticates it.
 */
export function combineAvailabilityBoundsV1(input: {
  readonly required: readonly AvailabilityBoundV1[];
}): AvailabilityBoundV1 {
  const data = closed(input, ["required"]);
  const bounds = snapshotRequiredBounds(data.required);
  let latest = 0;
  let hasUnavailable = false;
  for (let index = 0; index < bounds.length; index += 1) {
    const bound = bounds[index];
    if (bound.status === "unavailable") hasUnavailable = true;
    else latest = Math.max(latest, bound.notBeforeEpochMilliseconds);
  }
  if (hasUnavailable) return unavailableBound("component-bound-unavailable");
  return freezeBound(latest);
}

/** Never enumerate caller components through an iterator or an indexed read. */
function snapshotRequiredBounds(value: unknown): readonly AvailabilityBoundV1[] {
  if (isProxy(value) || !Array.isArray(value) ||
      Object.getPrototypeOf(value) !== ordinaryArrayPrototype) {
    throw new TypeError("Expected an ordinary non-proxy required array.");
  }
  const iterator = Object.getOwnPropertyDescriptor(ordinaryArrayPrototype, Symbol.iterator);
  if (!iterator || !Object.hasOwn(iterator, "value") || iterator.value !== ordinaryArrayIterator) {
    throw new TypeError("Unsupported inherited array iterator.");
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  const length: unknown = lengthDescriptor?.value;
  if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, "value") ||
      typeof length !== "number" || !Number.isSafeInteger(length) ||
      length < 1 || length > MAX_REQUIRED_COMPONENTS) {
    throw new RangeError("Unsupported required component count.");
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== length + 1) throw new TypeError("Required array must be closed and dense.");
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(?:0|[1-9]\d*)$/.test(key) || Number(key) >= length) {
      throw new TypeError("Unexpected required array property.");
    }
  }
  const snapshot: AvailabilityBoundV1[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable) {
      throw new TypeError("Every required component must be an own enumerable data property.");
    }
    const bound = readBound(descriptor.value);
    // Define own entries directly, even if a numeric Array.prototype setter exists.
    Object.defineProperty(snapshot, String(index), { value: bound, enumerable: true });
  }
  return Object.freeze(snapshot);
}

/** No result from this function grants evidence admission, ownership or succession. */
export function compareAvailabilityAsOfV1(input: {
  readonly bound: AvailabilityBoundV1; readonly cutoff: TemporalCutoffV1;
}): TemporalComparisonV1 {
  const data = closed(input, ["bound", "cutoff"]);
  const bound = readBound(data.bound);
  const cutoff = readInstant(data.cutoff, ["evaluation", "historical-cutoff"]);
  if (bound.status === "unavailable") return comparison("unavailable");
  return comparison(bound.notBeforeEpochMilliseconds <= cutoff.epochMilliseconds
    ? "satisfied" : "not-satisfied");
}

/** State identifiers are opaque equality inputs, not verified hashes or source identities. */
export function compareAvailabilityStatesV1(input: {
  readonly left: { readonly at: EvidenceAvailabilityV1; readonly stateKey: string };
  readonly right: { readonly at: EvidenceAvailabilityV1; readonly stateKey: string };
}): Readonly<{
  scope: "temporal-comparison-only"; authentication: "not-performed";
  order: "earlier" | "later" | "same-instant-same-state" | "same-instant-conflict";
}> {
  const data = closed(input, ["left", "right"]);
  const left = closed(data.left, ["at", "stateKey"]);
  const right = closed(data.right, ["at", "stateKey"]);
  const a = readInstant(left.at, ["evidence-availability"]);
  const b = readInstant(right.at, ["evidence-availability"]);
  if (typeof left.stateKey !== "string" || !left.stateKey.trim() ||
      typeof right.stateKey !== "string" || !right.stateKey.trim()) {
    throw new TypeError("Expected explicit state equality keys.");
  }
  const order = a.epochMilliseconds < b.epochMilliseconds ? "earlier"
    : a.epochMilliseconds > b.epochMilliseconds ? "later"
    : left.stateKey === right.stateKey ? "same-instant-same-state" : "same-instant-conflict";
  return Object.freeze({ scope: "temporal-comparison-only", authentication: "not-performed", order });
}

function instant<K extends TemporalInstantKindV1>(kind: K, input: unknown): TemporalInstantV1<K> {
  const data = closed(input, ["unit", "value"]);
  let value: number;
  if (data.unit === "epoch-milliseconds") value = milliseconds(data.value);
  else if (data.unit === "offset-iso" && typeof data.value === "string") {
    if (data.value.endsWith("-00:00")) throw new TypeError("Unknown ISO offset is not a qualified instant.");
    const offset = /[+-](\d{2}):(\d{2})$/.exec(data.value);
    if (offset && Number(offset[1]) * 60 + Number(offset[2]) > 14 * 60) {
      throw new TypeError("ISO offset exceeds the supported explicit offset domain.");
    }
    value = milliseconds(parseEventInstantV1(data.value, kind));
  } else throw new TypeError("Expected labelled milliseconds or an offset-bearing ISO instant.");
  return Object.freeze({ schemaVersion: TEMPORAL_TRUST_SCHEMA_VERSION_V1, kind,
    unit: "epoch-milliseconds", precision: "millisecond",
    epochMilliseconds: value, iso: new Date(value).toISOString() }) as TemporalInstantV1<K>;
}
function readInstant(value: unknown, kinds: readonly TemporalInstantKindV1[]): TemporalInstantV1<TemporalInstantKindV1> {
  const base = ["schemaVersion", "kind", "unit", "precision", "epochMilliseconds", "iso"];
  const data = closedVariant(value, "kind", {
    "acquisition-completion": base, evaluation: base, "qualified-publication": base,
    "evidence-availability": [...base, "acquisitionCompletedAtMs"],
    "historical-cutoff": [...base, "evaluatedAtMs"],
  });
  constants(data, { schemaVersion: TEMPORAL_TRUST_SCHEMA_VERSION_V1,
    unit: "epoch-milliseconds", precision: "millisecond" });
  if (!kinds.includes(data.kind as TemporalInstantKindV1)) throw new TypeError("Incorrect temporal role.");
  const rebuilt = instant(data.kind as TemporalInstantKindV1,
    { unit: "epoch-milliseconds", value: data.epochMilliseconds });
  if (data.iso !== rebuilt.iso) throw new TypeError("Inconsistent canonical instant.");
  if (data.kind === "evidence-availability") {
    const completed = milliseconds(data.acquisitionCompletedAtMs);
    if (completed > rebuilt.epochMilliseconds) throw new RangeError("Invalid availability ordering.");
    return Object.freeze({ ...rebuilt, acquisitionCompletedAtMs: completed });
  }
  if (data.kind === "historical-cutoff") {
    const evaluated = milliseconds(data.evaluatedAtMs);
    if (rebuilt.epochMilliseconds > evaluated) throw new RangeError("Invalid historical ordering.");
    return Object.freeze({ ...rebuilt, evaluatedAtMs: evaluated });
  }
  return rebuilt;
}
function readAccuracy(value: unknown): ClockAccuracyV1 {
  const data = closedVariant(value, "status", {
    unknown: ["schemaVersion", "kind", "status"],
    bounded: ["schemaVersion", "kind", "status", "unit", "maximumAbsoluteError", "provenance"],
  });
  constants(data, { schemaVersion: TEMPORAL_TRUST_SCHEMA_VERSION_V1, kind: "clock-accuracy" });
  if (data.status === "unknown") return createClockAccuracyV1({ status: "unknown" });
  return createClockAccuracyV1({ status: "bounded", unit: data.unit as "milliseconds",
    maximumAbsoluteError: data.maximumAbsoluteError as number,
    provenance: data.provenance as OwnerProvenanceClassificationV1 });
}
function accuracyFailure(provenance: OwnerProvenanceClassificationV1, accuracy: ClockAccuracyV1): UnavailableReasonV1 | null {
  if (provenance === "unavailable") return "acquisition-provenance-unavailable";
  if (accuracy.status === "unknown") return "clock-uncertainty-unavailable";
  if (accuracy.provenance === "unavailable") return "clock-provenance-unavailable";
  return null;
}
function freezeBound(value: number): AvailabilityBoundV1 {
  return Object.freeze({ schemaVersion: TEMPORAL_TRUST_SCHEMA_VERSION_V1,
    kind: "availability-bound", unit: "epoch-milliseconds", authentication: "not-performed",
    status: "bounded", notBeforeEpochMilliseconds: milliseconds(value) }) as AvailabilityBoundV1;
}
function unavailableBound(reason: UnavailableReasonV1): AvailabilityBoundV1 {
  return Object.freeze({ schemaVersion: TEMPORAL_TRUST_SCHEMA_VERSION_V1,
    kind: "availability-bound", unit: "epoch-milliseconds", authentication: "not-performed",
    status: "unavailable", reason }) as AvailabilityBoundV1;
}
function readBound(value: unknown): AvailabilityBoundV1 {
  const data = closedVariant(value, "status", {
    bounded: ["schemaVersion", "kind", "unit", "authentication", "status", "notBeforeEpochMilliseconds"],
    unavailable: ["schemaVersion", "kind", "unit", "authentication", "status", "reason"],
  });
  constants(data, { schemaVersion: TEMPORAL_TRUST_SCHEMA_VERSION_V1, kind: "availability-bound",
    unit: "epoch-milliseconds", authentication: "not-performed" });
  if (data.status === "bounded") return freezeBound(data.notBeforeEpochMilliseconds as number);
  const reasons: readonly UnavailableReasonV1[] = ["acquisition-provenance-unavailable",
    "clock-provenance-unavailable", "clock-uncertainty-unavailable", "component-bound-unavailable"];
  if (!reasons.includes(data.reason as UnavailableReasonV1)) throw new TypeError("Invalid unavailable reason.");
  return unavailableBound(data.reason as UnavailableReasonV1);
}
function comparison(status: TemporalComparisonV1["status"]): TemporalComparisonV1 {
  return Object.freeze({ schemaVersion: TEMPORAL_TRUST_SCHEMA_VERSION_V1,
    scope: "temporal-comparison-only", status, authentication: "not-performed",
    evidenceAdmission: "not-certified" });
}
/** Signed boundaries belong only to internal civil-date calculations. */
function signedMilliseconds(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new TypeError("Expected signed safe integral civil-date milliseconds.");
  }
  return value;
}
function civilDayInterval(utcMidnightMs: number, utcOffsetMinutes: number): Readonly<{
  startMs: number; endExclusiveMs: number;
}> {
  const midnight = signedMilliseconds(utcMidnightMs);
  const offsetMs = signedMilliseconds(utcOffsetMinutes * 60_000);
  const startMs = signedMilliseconds(midnight - offsetMs);
  const endExclusiveMs = signedMilliseconds(startMs + DAY_MS);
  return Object.freeze({ startMs, endExclusiveMs });
}
function milliseconds(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) {
    throw new TypeError("Expected nonnegative safe integral milliseconds.");
  }
  if (value > MAX_MS) throw new RangeError("Timestamp or bound exceeds the supported UTC domain.");
  return value;
}
function classification(value: unknown): OwnerProvenanceClassificationV1 {
  if (value !== "owner-asserted-authenticated" && value !== "unavailable") {
    throw new TypeError("Explicit owner provenance classification is required.");
  }
  return value;
}
function closed(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (isProxy(value) || typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Expected non-proxy closed temporal data.");
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError("Expected plain temporal data.");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  if (actual.length !== keys.length || actual.some(key => typeof key !== "string" || !keys.includes(key))) {
    throw new TypeError("Unexpected temporal fields.");
  }
  const result: Record<string, unknown> = Object.create(null);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = descriptors[key];
    if (!descriptor || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable) {
      throw new TypeError("Expected enumerable temporal data fields.");
    }
    result[key] = descriptor.value;
  }
  return result;
}
function closedVariant(value: unknown, discriminator: string,
  variants: Readonly<Record<string, readonly string[]>>): Record<string, unknown> {
  if (isProxy(value) || typeof value !== "object" || value === null) throw new TypeError("Expected non-proxy temporal variant.");
  const descriptor = Object.getOwnPropertyDescriptor(value, discriminator);
  if (!descriptor || !Object.hasOwn(descriptor, "value") || typeof descriptor.value !== "string" ||
      !Object.hasOwn(variants, descriptor.value)) throw new TypeError("Invalid temporal variant.");
  return closed(value, variants[descriptor.value]);
}
function constants(data: Record<string, unknown>, expected: Readonly<Record<string, string>>): void {
  for (const [key, value] of Object.entries(expected)) {
    if (data[key] !== value) throw new TypeError("Invalid temporal representation.");
  }
}
