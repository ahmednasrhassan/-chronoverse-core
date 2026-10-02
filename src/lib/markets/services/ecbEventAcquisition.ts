import "server-only";

import {
  ECB_GOVERNING_COUNCIL_CALENDAR_URL,
  ecbMonetaryPolicyCanonicalEventIdV1,
  type EcbMonetaryPolicyEventFactV1,
} from "../events/ecbMonetaryPolicy";
import { eventFactFromEcbMonetaryPolicyV1, type EventFactV1 } from "../events/eventFact";
import { EcbEventTransportError, loadEcbEventHtmlV1 } from "../providers/ecb/monetaryPolicy/acquisitionTransport";
import {
  attachKnownEcbDecisionCaptureV1,
  captureKnownEcbDecisionDocumentHtmlV1,
  normalizeEcbScheduleCandidateV1,
  parseEcbMonetaryPolicyScheduleHtmlV1,
  validateKnownEcbDecisionReferenceV1,
  type EcbKnownMonetaryPolicyDecisionReferenceInputV1,
  type EcbScheduleIdentityV1,
} from "../providers/ecb/monetaryPolicy/parser";
import type { CanonicalProductIdV1 } from "./canonicalProductResultOwnership";

export interface EcbEventAcquisitionInputV1 {
  readonly meetingDate: string;
  readonly identity: EcbScheduleIdentityV1;
  readonly affectedProducts: readonly CanonicalProductIdV1[];
  /** Caller-verified official reference; discovery and prose rate extraction are deferred. */
  readonly knownDecisionReference?: EcbKnownMonetaryPolicyDecisionReferenceInputV1;
}

export interface EcbEventAcquisitionDependenciesV1 {
  readonly fetchImpl?: typeof fetch;
  /** Trusted capture clock, called after each source response is fully read. No default wall clock. */
  readonly nowUnixSeconds: () => number;
  /** Required explicit caller cancellation/deadline; no acquisition-owned timers. */
  readonly signal: AbortSignal;
}

export type EcbEventAcquisitionResultV1 =
  | { readonly status: "acquired"; readonly event: EcbMonetaryPolicyEventFactV1; readonly fact: EventFactV1 }
  | { readonly status: "source-malformed"; readonly sourceUrl: string; readonly reason: string }
  | { readonly status: "schedule-unavailable"; readonly reason: "meeting-not-listed" | "unsupported-schedule-time" }
  | { readonly status: "invalid-reference"; readonly reason: string }
  | { readonly status: "reconciliation-required"; readonly priorCanonicalMeetingDate: string; readonly currentMeetingDate: string }
  | { readonly status: "provider-failure"; readonly error: EcbEventTransportError };

/**
 * INACTIVE: explicit server call only. No production caller, persistence or registration.
 * Calendar Day-2 dates reuse the existing parser. Current 14:15 Frankfurt schedule
 * is established by the ECB announcement effective 21 July 2022:
 * https://www.ecb.europa.eu/press/pr/date/2022/html/ecb.pr220627~73acedf868.en.html
 * Also confirmed on https://www.ecb.europa.eu/press/govcdec/mopo/html/index.en.html
 * This scheduled time is never evidence of actual publication. Earlier dates are unsupported.
 */
export async function acquireEcbEventV1(
  input: EcbEventAcquisitionInputV1,
  dependencies: EcbEventAcquisitionDependenciesV1,
): Promise<EcbEventAcquisitionResultV1> {
  if (typeof window !== "undefined") throw new Error("ECB event acquisition is server-only.");
  ecbMonetaryPolicyCanonicalEventIdV1(input.meetingDate);
  const products = { eurusd: true, eurjpy: true, eurgbp: true, eurchf: true, estr: true } satisfies Record<CanonicalProductIdV1, true>;
  if (!Array.isArray(input.affectedProducts) || input.affectedProducts.some((product) => !Object.hasOwn(products, product))) {
    throw new TypeError("ECB acquisition requires explicit canonical affected products.");
  }
  switch (input.identity.status) {
    case "initial": break;
    case "preserve": ecbMonetaryPolicyCanonicalEventIdV1(input.identity.canonicalMeetingDate); break;
    case "reconciliation-required":
      ecbMonetaryPolicyCanonicalEventIdV1(input.identity.priorCanonicalMeetingDate);
      return { status: "reconciliation-required", priorCanonicalMeetingDate: input.identity.priorCanonicalMeetingDate, currentMeetingDate: input.meetingDate };
    default: throw new TypeError("Unsupported ECB schedule identity discriminator.");
  }
  if (input.meetingDate < "2022-07-21") {
    return { status: "schedule-unavailable", reason: "unsupported-schedule-time" };
  }
  const reference = input.knownDecisionReference;
  if (reference !== undefined) {
    const validation = validateKnownEcbDecisionReferenceV1(reference);
    if (validation.status !== "available") return validation;
    if (reference.decisionDate !== input.meetingDate) {
      return { status: "invalid-reference", reason: "Decision reference does not match the requested meeting date." };
    }
  }
  const captureTime = (): number => {
    const value = dependencies.nowUnixSeconds();
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError("Invalid ECB acquisition capture time.");
    return value;
  };
  try {
    const calendar = await loadEcbEventHtmlV1(ECB_GOVERNING_COUNCIL_CALENDAR_URL, dependencies);
    const parsed = parseEcbMonetaryPolicyScheduleHtmlV1(calendar);
    if (parsed.status !== "available") return { ...parsed, sourceUrl: ECB_GOVERNING_COUNCIL_CALENDAR_URL };
    const fetchedAt = captureTime();
    const candidate = parsed.data.find((entry) => entry.meetingDate === input.meetingDate);
    if (candidate === undefined) return { status: "schedule-unavailable", reason: "meeting-not-listed" };
    const schedule = normalizeEcbScheduleCandidateV1(candidate, fetchedAt, input.identity);
    if (schedule.status !== "available") return schedule;
    let event = schedule.event;
    if (reference !== undefined) {
      const html = await loadEcbEventHtmlV1(reference.documentUrl, dependencies);
      // Only existing deterministic document capture, no interpretation of policy prose.
      const documentFetchedAt = captureTime();
      if (documentFetchedAt < fetchedAt) throw new RangeError("ECB acquisition capture clock moved backwards.");
      const capture = captureKnownEcbDecisionDocumentHtmlV1(html, reference, documentFetchedAt);
      if (capture.status === "invalid-reference") return capture;
      if (capture.status !== "available") {
        return { status: "source-malformed", sourceUrl: reference.documentUrl, reason: capture.reason };
      }
      // No historical first-observation claim is accepted without persistence context.
      const attached = attachKnownEcbDecisionCaptureV1(event, capture.data, documentFetchedAt);
      if (attached.status !== "available") throw new Error("Validated ECB decision could not attach to its schedule.");
      event = attached.event;
    }
    return Object.freeze({ status: "acquired", event, fact: eventFactFromEcbMonetaryPolicyV1(event, input.affectedProducts) });
  } catch (error) {
    if (error instanceof EcbEventTransportError) return { status: "provider-failure", error };
    throw error;
  }
}
