import {
  ECB_MONETARY_POLICY_EVENT_MEMORY_SCHEMA_VERSION_V1,
  parseEcbMonetaryPolicyEventMemoryV1,
  type EcbMonetaryPolicyEventSnapshotV1,
} from "../events/ecbMonetaryPolicyMemory";
import { isProxy } from "node:util/types";

export const ECB_HISTORICAL_CATALOG_PROJECTION_SCHEMA_V1 =
  "ecb-historical-catalog-projection-v1" as const;

export interface EcbHistoricalCatalogProjectionV1 {
  readonly schemaVersion:
    typeof ECB_HISTORICAL_CATALOG_PROJECTION_SCHEMA_V1;
  readonly status: "candidate";
  readonly canonicalEventId: string;
  readonly canonicalMeetingDate: string;
  readonly eventSourceVersionId: string;
  readonly knownAt: number;
  readonly scheduleFetchedAt: number;
  readonly decisionFetchedAt: number | null;
  readonly firstObservedAt: number | null;
  readonly actualReleasedAt: string | null;
  readonly ownershipVerified: false;
  readonly objectVerified: false;
}

export function projectEcbHistoricalCatalogCandidateV1(
  input: unknown,
): EcbHistoricalCatalogProjectionV1 {
  // Capture data without executing accessors or Proxy traps. ECB validation
  // and derived chronology remain exclusively the existing parser's concern.
  const snapshot = captureSnapshotData(input);

  const record = snapshot as EcbMonetaryPolicyEventSnapshotV1;

  const validated = parseEcbMonetaryPolicyEventMemoryV1({
    schemaVersion: ECB_MONETARY_POLICY_EVENT_MEMORY_SCHEMA_VERSION_V1,
    canonicalEventId: record?.canonicalEventId,
    snapshots: [snapshot],
  });

  if (validated === null) {
    throw new TypeError("Invalid ECB historical catalog candidate.");
  }

  const accepted = validated.snapshots[0]!;
  const decision = accepted.event.decision;

  return Object.freeze({
    schemaVersion: ECB_HISTORICAL_CATALOG_PROJECTION_SCHEMA_V1,
    status: "candidate",
    canonicalEventId: accepted.canonicalEventId,
    canonicalMeetingDate: accepted.event.canonicalMeetingDate,
    eventSourceVersionId: accepted.eventSourceVersionId,
    knownAt: accepted.knownAt,
    scheduleFetchedAt: accepted.event.schedule.fetchedAt,
    decisionFetchedAt: decision?.fetchedAt ?? null,
    firstObservedAt: decision?.firstObservedAt ?? null,
    actualReleasedAt: decision?.actualReleasedAt ?? null,
    ownershipVerified: false,
    objectVerified: false,
  });
}

/** Ordinary records/arrays only; no executable properties or opaque object types. */
function captureSnapshotData(input: unknown): unknown {
  try {
    return copyData(input, new WeakMap<object, object>());
  } catch {
    // Do not propagate caller-controlled exceptions or their contents.
    throw new TypeError("Invalid ECB historical catalog candidate.");
  }
}

function copyData(value: unknown, copies: WeakMap<object, object>): unknown {
  if (value === null || typeof value !== "object") {
    if (typeof value === "function" || typeof value === "symbol") {
      throw new TypeError();
    }
    return value;
  }
  if (isProxy(value)) throw new TypeError();
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (!array && prototype !== null && prototype !== Object.prototype) {
    throw new TypeError();
  }
  const previous = copies.get(value);
  if (previous !== undefined) return previous;

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const copy: object = array
    ? new Array(descriptors.length!.value as number)
    : Object.create(null);
  copies.set(value, copy);
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key as keyof typeof descriptors]!;
    if (!("value" in descriptor)) throw new TypeError();
    if (typeof key === "string" && descriptor.enumerable) {
      Object.defineProperty(copy, key, {
        value: copyData(descriptor.value, copies),
        enumerable: true,
      });
    }
  }
  return Object.freeze(copy);
}
