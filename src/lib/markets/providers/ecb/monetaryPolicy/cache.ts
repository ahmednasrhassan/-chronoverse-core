import "server-only";

import { unstable_cache } from "next/cache";

import { ECB_SOURCE_INSTITUTION } from "../../../events/ecbMonetaryPolicy";
import {
  ecbMonetaryPolicyClientV1,
  type EcbMonetaryPolicySourceResultV1,
} from "./client";
import {
  validateKnownEcbDecisionReferenceV1,
  type EcbKnownMonetaryPolicyDecisionReferenceInputV1,
  type EcbMonetaryPolicyScheduleCandidateV1,
} from "./parser";

export const ECB_MONETARY_POLICY_SCHEDULE_CACHE_SECONDS_V1 = 24 * 60 * 60;
export const ECB_MONETARY_POLICY_DOCUMENT_CACHE_SECONDS_V1 = 24 * 60 * 60;

type EcbMonetaryPolicyScheduleSourceResultV1 =
  EcbMonetaryPolicySourceResultV1<
    readonly EcbMonetaryPolicyScheduleCandidateV1[]
  >;

interface EcbMonetaryPolicyScheduleLoggerV1 {
  readonly info: (entry: Readonly<Record<string, unknown>>) => void;
  readonly warn: (entry: Readonly<Record<string, unknown>>) => void;
}

/**
 * Records one safe summary when the shared cached producer executes.
 * Exported only for focused contract testing; the returned source object is
 * deliberately preserved by identity.
 */
export function observeEcbMonetaryPolicyScheduleSourceV1(
  result: EcbMonetaryPolicyScheduleSourceResultV1,
  logger: EcbMonetaryPolicyScheduleLoggerV1 = console,
): EcbMonetaryPolicyScheduleSourceResultV1 {
  try {
    if (result.status === "available") {
      logger.info({
        component: "ecb-monetary-policy-schedule",
        status: result.status,
        sourceUrl: result.sourceUrl,
        fetchedAt: result.fetchedAt,
        candidateCount: result.data.length,
        firstMeetingDate: result.data[0]?.meetingDate ?? null,
        lastMeetingDate: result.data.at(-1)?.meetingDate ?? null,
      });
    } else {
      logger.warn({
        component: "ecb-monetary-policy-schedule",
        status: result.status,
        reason: result.reason,
        sourceUrl: result.sourceUrl,
      });
    }
  } catch {
    // Observability must never change schedule-source delivery.
  }

  return result;
}

/** One shared server entry owns the complete Governing Council schedule. */
const getCachedScheduleV3 = unstable_cache(
  async () => observeEcbMonetaryPolicyScheduleSourceV1(
    await ecbMonetaryPolicyClientV1.getSchedule(),
  ),
  ["chronoverse", "providers", "ecb", "monetary-policy-schedule-v3"],
  {
    revalidate: ECB_MONETARY_POLICY_SCHEDULE_CACHE_SECONDS_V1,
    tags: ["ecb-monetary-policy-schedule-v1"],
  },
);

const getCachedKnownDecisionDocumentV1 = unstable_cache(
  async (documentUrl: string, decisionDate: string) =>
    ecbMonetaryPolicyClientV1.getKnownDecisionDocument({
      sourceInstitution: ECB_SOURCE_INSTITUTION,
      decisionDate,
      documentUrl,
    }),
  ["chronoverse", "providers", "ecb", "known-monetary-policy-decision-document-v1"],
  {
    revalidate: ECB_MONETARY_POLICY_DOCUMENT_CACHE_SECONDS_V1,
    tags: ["ecb-known-monetary-policy-decision-document-v1"],
  },
);

export async function getEcbMonetaryPolicyScheduleSourceV1() {
  return getCachedScheduleV3();
}

/** Automatic discovery is deferred; callers must supply a verified official reference. */
export async function getEcbKnownMonetaryPolicyDecisionDocumentSourceV1(
  input: EcbKnownMonetaryPolicyDecisionReferenceInputV1,
) {
  const validation = validateKnownEcbDecisionReferenceV1(input);
  if (validation.status === "invalid-reference") return validation;
  return getCachedKnownDecisionDocumentV1(
    validation.reference.documentUrl,
    validation.reference.decisionDate,
  );
}
