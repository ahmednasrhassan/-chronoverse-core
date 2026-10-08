import "server-only";
import { types } from "node:util";
import { parseEventInstantV1 } from "./eventClock";

export const OFFICIAL_POLICY_PREDECESSOR_PROOF_SCHEMA_VERSION_V1 =
  "official-policy-predecessor-proof-v1" as const;

export type OfficialPolicyPredecessorUnavailableReasonV1 =
  | "INSUFFICIENT_EVIDENCE"
  | "AMBIGUOUS_CANDIDATE"
  | "OFFICIAL_SEQUENCE_CONTINUITY_UNPROVEN"
  | "CONFLICTING_OFFICIAL_SOURCES"
  | "FUTURE_OR_INADMISSIBLE_EVIDENCE"
  | "TRUSTED_ACQUISITION_PROVENANCE_UNAVAILABLE";

export type OfficialPolicyComparisonUnavailableReasonV1 =
  | "OFFICIAL_PREDECESSOR_UNAVAILABLE"
  | "INSTRUMENT_OR_REGIME_MISMATCH";

type PolicyRequestV1 =
  | { readonly provider: "ecb"; readonly requestedCurrentDecision: {
      readonly kind: "ecb-event";
      readonly canonicalEventId: `ECB:ecb-monetary-policy-decision:${string}`;
    } }
  | { readonly provider: "federal-reserve"; readonly requestedCurrentDecision: {
      readonly kind: "policy-series";
      readonly canonicalSeriesId: `us-fomc-policy-decision:${string}`;
    } }
  | { readonly provider: "boj"; readonly requestedCurrentDecision: {
      readonly kind: "policy-series";
      readonly canonicalSeriesId: `japan-boj-policy-decision:${string}`;
    } }
  | { readonly provider: "boe"; readonly requestedCurrentDecision: {
      readonly kind: "policy-series";
      readonly canonicalSeriesId: `uk-boe-bank-rate-decision:${string}`;
    } }
  | { readonly provider: "snb"; readonly requestedCurrentDecision: {
      readonly kind: "policy-series";
      readonly canonicalSeriesId: `switzerland-snb-policy-decision:${string}`;
    } };

export type OfficialPolicyPredecessorProofInputV1 = PolicyRequestV1 & {
  readonly evaluatedAt: string;
  readonly knowledgeCutoff: number;
  /** Caller-declared diagnostic, never an authority finding or attestation. */
  readonly unavailableReason: OfficialPolicyPredecessorUnavailableReasonV1;
  readonly comparisonUnavailableReason: OfficialPolicyComparisonUnavailableReasonV1;
  readonly includeDiagnostics?: boolean;
};

type InstitutionV1<P extends PolicyRequestV1["provider"]> =
  P extends "ecb" ? "ECB" :
  P extends "federal-reserve" ? "Board of Governors of the Federal Reserve System / FOMC" :
  P extends "boj" ? "Bank of Japan" :
  P extends "boe" ? "Bank of England" : "Swiss National Bank";

type DescriptionForRequestV1<R extends PolicyRequestV1> = R extends PolicyRequestV1 ? {
  readonly provider: R["provider"];
  readonly institution: InstitutionV1<R["provider"]>;
  readonly requestedCurrentDecision: R["requestedCurrentDecision"] & {
    readonly semantic: "request-metadata";
  };
} : never;

/** Serializable description only. Even a copied or branded value conveys no trust. */
export type OfficialPolicyPredecessorProofDescriptionV1 = DescriptionForRequestV1<PolicyRequestV1> & {
  readonly schemaVersion: typeof OFFICIAL_POLICY_PREDECESSOR_PROOF_SCHEMA_VERSION_V1;
  readonly semantic: "unavailable-proof-description";
  readonly evaluatedAt: string;
  readonly knowledgeCutoff: number;
  readonly officialPredecessor: {
    readonly status: "unavailable";
    readonly reason: OfficialPolicyPredecessorUnavailableReasonV1;
    readonly reasonBasis: "caller-declared-diagnostic";
  };
  readonly comparisonEligibility: {
    readonly status: "unavailable";
    readonly reason: OfficialPolicyComparisonUnavailableReasonV1;
    readonly reasonBasis: "caller-declared-diagnostic";
  };
  readonly diagnostics?: {
    readonly verification: "not-performed";
    readonly trustedCapabilityIssuance: "unavailable";
  };
};

/** V1 has no verifier, issuer, consumer or inhabitant of a trusted capability. */
export type TrustedOfficialPolicyPredecessorProofCapabilityV1 = never;

/**
 * Inactive foundation: validates request syntax and describes unavailability only.
 * No supplied history, receipt, digest, knownAt, settings or evidence is accepted.
 * Reasons are caller diagnostics; this function does not establish their truth.
 * ECB DFR/MRO/MLF, FOMC endpoints, BoJ scalar/range/around and set-guideline,
 * BoE Bank Rate and SNB signed rates remain native to their existing providers.
 * No rate arithmetic, direction normalization or comparison certification occurs.
 */
export function buildUnavailableOfficialPolicyPredecessorProofV1(
  input: OfficialPolicyPredecessorProofInputV1,
): OfficialPolicyPredecessorProofDescriptionV1 {
  const data = readClosedData(input, [
    "provider", "requestedCurrentDecision", "evaluatedAt", "knowledgeCutoff",
    "unavailableReason", "comparisonUnavailableReason",
  ], ["includeDiagnostics"]);
  const spec = providerSpec(data.provider);
  const identityKey = spec.kind === "ecb-event" ? "canonicalEventId" : "canonicalSeriesId";
  const request = readClosedData(data.requestedCurrentDecision, ["kind", identityKey]);
  const identity = request[identityKey];
  if (request.kind !== spec.kind || typeof identity !== "string" || !identity.startsWith(spec.prefix)) {
    throw new TypeError("Invalid provider-bound requested current decision identity.");
  }
  const date = identity.slice(spec.prefix.length);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new TypeError("Invalid decision identity date.");
  parseEventInstantV1(`${date}T00:00:00Z`, "decision identity date");
  // Syntactic identity only: its date does not attest occurrence, order or release.
  if (typeof data.evaluatedAt !== "string") throw new TypeError("Invalid evaluatedAt.");
  const evaluatedAtMs = parseEventInstantV1(data.evaluatedAt, "evaluatedAt");
  if (evaluatedAtMs < 0 || typeof data.knowledgeCutoff !== "number" ||
      !Number.isSafeInteger(data.knowledgeCutoff) || data.knowledgeCutoff < 0 ||
      data.knowledgeCutoff > Math.floor(evaluatedAtMs / 1000)) {
    throw new TypeError("Invalid knowledge cutoff or evaluation instant.");
  }
  const reason = unavailableReason(data.unavailableReason);
  const comparisonReason = data.comparisonUnavailableReason;
  if (comparisonReason !== "OFFICIAL_PREDECESSOR_UNAVAILABLE" &&
      comparisonReason !== "INSTRUMENT_OR_REGIME_MISMATCH") {
    throw new TypeError("Invalid comparison unavailable reason.");
  }
  if (Object.hasOwn(data, "includeDiagnostics") && typeof data.includeDiagnostics !== "boolean") {
    throw new TypeError("Invalid diagnostics option.");
  }
  // Only retained descriptor values are used below; caller objects are never cloned.
  const requestedCurrentDecision = Object.freeze({
    kind: spec.kind, [identityKey]: identity, semantic: "request-metadata" as const,
  });
  return Object.freeze({
    schemaVersion: OFFICIAL_POLICY_PREDECESSOR_PROOF_SCHEMA_VERSION_V1,
    semantic: "unavailable-proof-description" as const,
    provider: spec.provider,
    institution: spec.institution,
    requestedCurrentDecision,
    evaluatedAt: new Date(evaluatedAtMs).toISOString(),
    knowledgeCutoff: data.knowledgeCutoff === 0 ? 0 : data.knowledgeCutoff,
    officialPredecessor: Object.freeze({
      status: "unavailable" as const, reason, reasonBasis: "caller-declared-diagnostic" as const,
    }),
    comparisonEligibility: Object.freeze({
      status: "unavailable" as const, reason: comparisonReason,
      reasonBasis: "caller-declared-diagnostic" as const,
    }),
    ...(data.includeDiagnostics === true ? {
      diagnostics: Object.freeze({
        verification: "not-performed" as const,
        trustedCapabilityIssuance: "unavailable" as const,
      }),
    } : {}),
  }) as OfficialPolicyPredecessorProofDescriptionV1;
}

/** Two small closed records; inspect proxies before any reflective operation. */
function readClosedData(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (typeof value !== "object" || value === null || types.isProxy(value)) {
    throw new TypeError("Expected a non-proxy data record.");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Expected a plain or null-prototype data record.");
  }
  const retained: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || (!required.includes(key) && !optional.includes(key))) {
      throw new TypeError("Unexpected data record field.");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) {
      throw new TypeError("Expected an enumerable own data field.");
    }
    retained[key] = descriptor.value;
  }
  if (required.some(key => !Object.hasOwn(retained, key))) throw new TypeError("Missing data record field.");
  return retained;
}

function unavailableReason(value: unknown): OfficialPolicyPredecessorUnavailableReasonV1 {
  switch (value) {
    case "INSUFFICIENT_EVIDENCE":
    case "AMBIGUOUS_CANDIDATE":
    case "OFFICIAL_SEQUENCE_CONTINUITY_UNPROVEN":
    case "CONFLICTING_OFFICIAL_SOURCES":
    case "FUTURE_OR_INADMISSIBLE_EVIDENCE":
    case "TRUSTED_ACQUISITION_PROVENANCE_UNAVAILABLE": return value;
    default: throw new TypeError("Invalid predecessor unavailable reason.");
  }
}

function providerSpec(value: unknown) {
  // Canonical prefixes mirror provider normalizers; importing them is unnecessary.
  // ECB uses its canonical meeting anchor; BoE uses publication date in its series.
  switch (value) {
    case "ecb": return { provider: value, institution: "ECB", kind: "ecb-event", prefix: "ECB:ecb-monetary-policy-decision:" } as const;
    case "federal-reserve": return { provider: value, institution: "Board of Governors of the Federal Reserve System / FOMC", kind: "policy-series", prefix: "us-fomc-policy-decision:" } as const;
    case "boj": return { provider: value, institution: "Bank of Japan", kind: "policy-series", prefix: "japan-boj-policy-decision:" } as const;
    case "boe": return { provider: value, institution: "Bank of England", kind: "policy-series", prefix: "uk-boe-bank-rate-decision:" } as const;
    case "snb": return { provider: value, institution: "Swiss National Bank", kind: "policy-series", prefix: "switzerland-snb-policy-decision:" } as const;
    default: throw new TypeError("Unsupported policy provider.");
  }
}
