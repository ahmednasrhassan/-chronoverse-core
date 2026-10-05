import { isDeepStrictEqual } from "node:util";
import { buildBilateralPolicyEventReadinessV1, type BilateralPolicyEventReadinessV1 } from "./bilateralPolicyEventReadiness";
import type { BilateralPolicyStateV1 } from "./bilateralPolicyState";
import { buildEcbPolicyDecisionDeltaV1, type EcbPolicyDecisionDeltaResultV1 } from "./ecbPolicyDecisionDelta";
import type { EcbMonetaryPolicyPriorStateResultV1 } from "./ecbMonetaryPolicyPriorState";
import { selectPolicyEventPriorAsKnownAtV1, type SelectPolicyEventPriorInputV1,
  type PolicyEventPriorSelectionV1 } from "./policyEventPriorSelection";

type Institution = PolicyEventPriorSelectionV1["institution"];
type Prior = PolicyEventPriorSelectionV1["prior"];
type UnavailableTarget = Extract<Prior, { reason: "TARGET_CONTEXT_UNAVAILABLE" }>;
type NumericFailure = "UNSUPPORTED_RATE_PRECISION" | "UNSUPPORTED_RATE_RANGE";
type Aggregate = "ALL_INCREASED" | "ALL_DECREASED" | "ALL_UNCHANGED" | "MIXED";
type Side = BilateralPolicyStateV1["left"] | BilateralPolicyStateV1["right"];
type EvidenceData<S extends Side> = Pick<Extract<S, { availability: "available" | "partial" }>["data"],
  "snapshot" | "policySetting" | "instrument" | "timing" | "knownAt">;
type Target<I extends Institution, S extends Side> = {
  readonly status: "available";
  readonly institution: I;
  readonly binding: NonNullable<PolicyEventPriorSelectionV1["target"]>;
  readonly data: EvidenceData<S>;
};
type RightSide<P extends BilateralPolicyStateV1["productId"]> = Extract<BilateralPolicyStateV1, { productId: P }>["right"];
export type PolicyEventDecisionTargetEvidenceV1 =
  | ({ readonly status: "unavailable" } & Pick<UnavailableTarget, "targetReason" | "upstreamReason">)
  | Target<"ECB", BilateralPolicyStateV1["left"]>
  | Target<"FOMC", RightSide<"eurusd">>
  | Target<"BoJ", RightSide<"eurjpy">>
  | Target<"BoE", RightSide<"eurgbp">>
  | Target<"SNB", RightSide<"eurchf">>;

export interface PolicyEventRateChangeV1 {
  readonly previousRate: number;
  readonly targetRate: number;
  readonly deltaPercentagePoints: number;
  readonly deltaBasisPoints: number;
  /** Numeric direction only, with no policy interpretation. */
  readonly direction: "INCREASE" | "DECREASE" | "UNCHANGED";
}
type EcbAvailable = Extract<EcbPolicyDecisionDeltaResultV1, { status: "available" }>;
type EcbUnavailable = Extract<EcbPolicyDecisionDeltaResultV1, { status: "unavailable" }>;
export type PolicyEventDecisionChangeResultV1 =
  | { readonly status: "unavailable"; readonly institution: Institution;
      readonly reason: "TARGET_CONTEXT_UNAVAILABLE"; readonly targetReason: UnavailableTarget["targetReason"];
      readonly upstreamReason: string | null }
  | { readonly status: "unavailable"; readonly institution: Institution;
      readonly reason: "PRIOR_STATE_UNAVAILABLE"; readonly priorReason: Exclude<Extract<Prior, { status: "unavailable" }>["reason"], "TARGET_CONTEXT_UNAVAILABLE"> }
  | { readonly status: "unavailable"; readonly institution: Exclude<Institution, "ECB">; readonly reason: NumericFailure }
  | { readonly status: "unavailable"; readonly institution: "ECB";
      readonly reason: "ECB_DELTA_UNAVAILABLE"; readonly deltaReason: EcbUnavailable["reason"];
      readonly priorReason?: Extract<EcbUnavailable, { reason: "PRIOR_STATE_UNAVAILABLE" }>["priorReason"] }
  | { readonly status: "unavailable"; readonly institution: "BoJ"; readonly reason: "INCOMPATIBLE_POLICY_SHAPES";
      readonly fromShape: "scalar" | "range"; readonly toShape: "scalar" | "range" }
  | { readonly status: "available"; readonly institution: "ECB"; readonly rates: EcbAvailable["rates"]; readonly aggregate: EcbAvailable["aggregate"] }
  | { readonly status: "available"; readonly institution: "FOMC";
      readonly targetLower: PolicyEventRateChangeV1; readonly targetUpper: PolicyEventRateChangeV1; readonly aggregate: Aggregate }
  | { readonly status: "available"; readonly institution: "BoJ"; readonly shape: "scalar";
      readonly qualification: "around"; readonly nominalTarget: PolicyEventRateChangeV1 }
  | { readonly status: "available"; readonly institution: "BoJ"; readonly shape: "range";
      readonly qualification: "around"; readonly lower: PolicyEventRateChangeV1; readonly upper: PolicyEventRateChangeV1; readonly aggregate: Aggregate }
  | { readonly status: "available"; readonly institution: "BoE"; readonly bankRate: PolicyEventRateChangeV1 }
  | { readonly status: "available"; readonly institution: "SNB"; readonly policyRate: PolicyEventRateChangeV1 };

export interface PolicyEventDecisionChangeV1 {
  readonly schemaVersion: "policy-event-decision-change-v1";
  readonly semantic: "derived-feature";
  readonly feature: "policy-event-decision-change";
  readonly productId: PolicyEventPriorSelectionV1["productId"];
  readonly focusSide: "left" | "right";
  readonly institution: Institution;
  readonly evaluatedAt: string;
  readonly knowledgeCutoff: number;
  readonly coverage: "provided-history-only";
  readonly selectionBasis: "last-earlier-supplied-announcement";
  readonly priorSelection: PolicyEventPriorSelectionV1;
  readonly targetEvidence: PolicyEventDecisionTargetEvidenceV1;
  readonly change: PolicyEventDecisionChangeResultV1;
  readonly evidenceKnownAt: number | null;
}

/** INACTIVE: target minus selected earlier supplied announcement, within one institution. */
export function buildPolicyEventDecisionChangeV1(input: SelectPolicyEventPriorInputV1): PolicyEventDecisionChangeV1 {
  assertRoot(input);
  const selected = selectPolicyEventPriorAsKnownAtV1(input);
  // The selector intentionally retains no target policy facts. Independently rebuild
  // admission; only these canonical results are read for evidence and arithmetic.
  const readiness = buildBilateralPolicyEventReadinessV1(input.readinessInput);
  const target = rebuildTarget(readiness);
  const institution = readiness.focus.side === "left" ? "ECB"
    : ({ eurusd: "FOMC", eurjpy: "BoJ", eurgbp: "BoE", eurchf: "SNB" } as const)[readiness.productId];
  requireAgreement(selected.productId === readiness.productId && selected.focusSide === readiness.focus.side &&
    selected.institution === institution && selected.evaluatedAt === readiness.evaluatedAt);
  if (target.status === "unavailable") {
    requireAgreement(selected.target === null && selected.prior.status === "unavailable" &&
      selected.prior.reason === "TARGET_CONTEXT_UNAVAILABLE" &&
      selected.prior.targetReason === target.targetReason && selected.prior.upstreamReason === target.upstreamReason);
  } else {
    requireAgreement(isDeepStrictEqual(selected.target, target.binding) &&
      isDeepStrictEqual(readiness.focus.admittedCanonicalReference, target.binding.canonicalReference) &&
      readiness.focus.knownAt === target.binding.knownAt && selected.institution === target.institution);
  }
  const evidenceKnownAt = target.status === "unavailable" ? null
    : selected.prior.status === "available" ? Math.max(target.binding.knownAt, selected.prior.knownAt) : target.binding.knownAt;
  requireAgreement(selected.evidenceKnownAt === evidenceKnownAt);
  return freezeCopy({ schemaVersion: "policy-event-decision-change-v1", semantic: "derived-feature",
    feature: "policy-event-decision-change", productId: selected.productId, focusSide: selected.focusSide,
    institution, evaluatedAt: selected.evaluatedAt, knowledgeCutoff: selected.knowledgeCutoff,
    coverage: selected.coverage, selectionBasis: selected.selectionBasis, priorSelection: selected,
    targetEvidence: target, change: compare(target, selected), evidenceKnownAt });
}

function rebuildTarget(readiness: BilateralPolicyEventReadinessV1): PolicyEventDecisionTargetEvidenceV1 {
  const state = readiness.policyState;
  const side = readiness.focus.side === "left" ? state.left : state.right;
  if (side.availability === "unavailable") return {
    status: "unavailable", targetReason: side.reason, upstreamReason: side.upstreamReason };
  if (readiness.focus.side === "left") {
    const left = state.left;
    if (left.availability === "unavailable") throw new TypeError("Expected admitted ECB target.");
    const snapshot = left.data.snapshot;
    return { status: "available", institution: "ECB", data: evidenceData(left.data), binding: {
      institution: "ECB", selectionDateKind: "meeting-date", selectionDate: snapshot.event.schedule.meetingDate,
      knownAt: snapshot.knownAt, canonicalReference: { kind: "ecb-event", canonicalEventId: snapshot.canonicalEventId,
        eventSourceVersionId: snapshot.eventSourceVersionId } } };
  }
  switch (state.productId) {
    case "eurusd": return rightTarget("FOMC", state.right);
    case "eurjpy": return rightTarget("BoJ", state.right);
    case "eurgbp": return rightTarget("BoE", state.right);
    case "eurchf": return rightTarget("SNB", state.right);
  }
}
function evidenceData<D extends EvidenceData<Side>>(data: D): Pick<D, keyof EvidenceData<Side>> {
  return { snapshot: data.snapshot, policySetting: data.policySetting, timing: data.timing,
    instrument: data.instrument, knownAt: data.knownAt };
}
function rightTarget<I extends Exclude<Institution, "ECB">, S extends BilateralPolicyStateV1["right"]>(
  institution: I, side: S,
): Target<I, S> {
  if (side.availability !== "available") throw new TypeError("Expected complete admitted counterparty target.");
  const fact = side.data.policySetting.data;
  const snapshot = side.data.snapshot;
  return { status: "available", institution, data: evidenceData(side.data) as EvidenceData<S>, binding: {
    institution, selectionDateKind: institution === "BoE" ? "publication-date" : "decision-date",
    selectionDate: "meetingEndDate" in fact ? fact.publicationDate : fact.decisionDate, knownAt: snapshot.knownAt,
    canonicalReference: { kind: "policy-series", canonicalSeriesId: snapshot.canonicalSeriesId, sourceVersionId: snapshot.sourceVersionId } } };
}

function compare(target: PolicyEventDecisionTargetEvidenceV1, selected: PolicyEventPriorSelectionV1): PolicyEventDecisionChangeResultV1 {
  if (target.status === "unavailable") return { status: "unavailable", institution: selected.institution,
    reason: "TARGET_CONTEXT_UNAVAILABLE", targetReason: target.targetReason, upstreamReason: target.upstreamReason };
  const prior = selected.prior;
  if (target.institution === "ECB") {
    const context = { coverage: selected.coverage, knowledgeCutoff: selected.knowledgeCutoff, evaluatedAt: selected.evaluatedAt };
    let projected: EcbMonetaryPolicyPriorStateResultV1;
    if (prior.status === "unavailable") {
      if (prior.reason === "TARGET_CONTEXT_UNAVAILABLE") throw new TypeError("Admitted target requires selector context.");
      projected = { ...context, status: "unavailable", reason: prior.reason };
    } else {
      if (prior.institution !== "ECB") throw new TypeError("Expected selected ECB prior.");
      const current = target.data.snapshot;
      requireAgreement(prior.targetBinding.canonicalEventId === current.canonicalEventId &&
        isDeepStrictEqual(prior.targetBinding.event.schedule, current.event.schedule));
      projected = { ...context, status: "available", canonicalEventId: prior.canonicalReference.canonicalEventId,
        decisionDate: prior.selectionDate, knownAt: prior.knownAt, eventSourceVersionId: prior.sourceVersionId,
        selectedSnapshot: prior.snapshot, targetSnapshot: prior.targetBinding,
        announcement: { value: { kind: "ecb-policy-rates", rates: prior.policySetting }, provenance: prior.provenance } };
    }
    const delta = buildEcbPolicyDecisionDeltaV1({ current: target.data.snapshot.event, prior: projected, evaluatedAt: selected.evaluatedAt });
    return delta.status === "available" ? { status: "available", institution: "ECB", rates: delta.rates, aggregate: delta.aggregate }
      : { status: "unavailable", institution: "ECB", reason: "ECB_DELTA_UNAVAILABLE", deltaReason: delta.reason,
        ...(delta.reason === "PRIOR_STATE_UNAVAILABLE" ? { priorReason: delta.priorReason } : {}) };
  }
  if (prior.status === "unavailable") {
    if (prior.reason === "TARGET_CONTEXT_UNAVAILABLE") throw new TypeError("Admitted target requires selector context.");
    return { status: "unavailable", institution: target.institution, reason: "PRIOR_STATE_UNAVAILABLE", priorReason: prior.reason };
  }
  const failure = (reason: NumericFailure): PolicyEventDecisionChangeResultV1 =>
    ({ status: "unavailable", institution: target.institution, reason });
  switch (target.institution) {
    case "FOMC": {
      if (prior.institution !== "FOMC" || target.data.policySetting.availability !== "available") throw new TypeError("Expected FOMC facts.");
      const fact = target.data.policySetting.data;
      const lower = rateChange(prior.policySetting.targetLower, fact.targetLower);
      const upper = rateChange(prior.policySetting.targetUpper, fact.targetUpper);
      if (typeof lower === "string") return failure(lower);
      if (typeof upper === "string") return failure(upper);
      return { status: "available", institution: "FOMC", targetLower: lower, targetUpper: upper, aggregate: aggregate(lower, upper) };
    }
    case "BoJ": {
      if (prior.institution !== "BoJ" || target.data.policySetting.availability !== "available") throw new TypeError("Expected BoJ facts.");
      const before = prior.policySetting.target;
      const after = target.data.policySetting.data.target;
      if (before.shape === "scalar" && after.shape === "scalar") {
        const nominal = rateChange(before.value, after.value);
        return typeof nominal === "string" ? failure(nominal) : { status: "available", institution: "BoJ",
          shape: "scalar", qualification: after.qualification, nominalTarget: nominal };
      }
      if (before.shape === "range" && after.shape === "range") {
        const lower = rateChange(before.lower, after.lower);
        const upper = rateChange(before.upper, after.upper);
        if (typeof lower === "string") return failure(lower);
        if (typeof upper === "string") return failure(upper);
        return { status: "available", institution: "BoJ", shape: "range", qualification: after.qualification,
          lower, upper, aggregate: aggregate(lower, upper) };
      }
      return { status: "unavailable", institution: "BoJ", reason: "INCOMPATIBLE_POLICY_SHAPES", fromShape: before.shape, toShape: after.shape };
    }
    case "BoE": {
      if (prior.institution !== "BoE" || target.data.policySetting.availability !== "available") throw new TypeError("Expected BoE facts.");
      const bankRate = rateChange(prior.policySetting.decision.rate, target.data.policySetting.data.decision.rate);
      return typeof bankRate === "string" ? failure(bankRate) : { status: "available", institution: "BoE", bankRate };
    }
    case "SNB": {
      if (prior.institution !== "SNB" || target.data.policySetting.availability !== "available") throw new TypeError("Expected SNB facts.");
      const policyRate = rateChange(prior.policySetting.decision.rate, target.data.policySetting.data.decision.rate);
      return typeof policyRate === "string" ? failure(policyRate) : { status: "available", institution: "SNB", policyRate };
    }
  }
}

/** Decimal text to integer units. Scientific notation below the supported quantum is precision failure. */
function scaled(value: number, places: number): number | NumericFailure {
  const scale = 10 ** places;
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER / scale) return "UNSUPPORTED_RATE_RANGE";
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (match === null || (match[3]?.length ?? 0) > places) return "UNSUPPORTED_RATE_PRECISION";
  const integer = Number(`${match[1]}${match[2]}${(match[3] ?? "").padEnd(places, "0")}`);
  if (!Number.isSafeInteger(integer) || integer / scale !== value) return "UNSUPPORTED_RATE_RANGE";
  return integer === 0 ? 0 : integer;
}
function rateChange(previous: number, target: number): PolicyEventRateChangeV1 | NumericFailure {
  const before = scaled(previous, 6);
  const after = scaled(target, 6);
  if (typeof before === "string") return before;
  if (typeof after === "string") return after;
  const difference = after - before;
  const pp = difference / 1_000_000;
  const bp = difference / 10_000;
  if (!Number.isSafeInteger(difference) || scaled(pp, 6) !== difference || scaled(bp, 4) !== difference) return "UNSUPPORTED_RATE_RANGE";
  return { previousRate: previous === 0 ? 0 : previous, targetRate: target === 0 ? 0 : target,
    deltaPercentagePoints: pp === 0 ? 0 : pp, deltaBasisPoints: bp === 0 ? 0 : bp,
    direction: difference > 0 ? "INCREASE" : difference < 0 ? "DECREASE" : "UNCHANGED" };
}
function aggregate(...components: readonly PolicyEventRateChangeV1[]): Aggregate {
  if (components.every((c) => c.direction === "INCREASE")) return "ALL_INCREASED";
  if (components.every((c) => c.direction === "DECREASE")) return "ALL_DECREASED";
  if (components.every((c) => c.direction === "UNCHANGED")) return "ALL_UNCHANGED";
  return "MIXED";
}
function requireAgreement(agrees: boolean): void {
  if (!agrees) throw new TypeError("Independent canonical policy decision contexts disagree.");
}
function assertRoot(value: unknown): void {
  const keys = ["readinessInput", "knowledgeCutoff", "history"];
  if (typeof value !== "object" || value === null || Array.isArray(value) ||
      Reflect.ownKeys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new TypeError("Expected closed policy decision-change fields.");
  }
}
function freezeCopy<T>(value: T): T {
  const copy = structuredClone(value);
  function freeze(nested: unknown): void {
    if (typeof nested !== "object" || nested === null) return;
    for (const child of Object.values(nested)) freeze(child);
    Object.freeze(nested);
  }
  freeze(copy);
  return copy;
}
