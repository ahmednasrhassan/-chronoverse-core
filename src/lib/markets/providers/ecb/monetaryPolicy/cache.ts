import "server-only";

import { unstable_cache } from "next/cache";

import { ECB_SOURCE_INSTITUTION } from "../../../events/ecbMonetaryPolicy";
import { ecbMonetaryPolicyClientV1 } from "./client";
import {
  validateKnownEcbDecisionReferenceV1,
  type EcbKnownMonetaryPolicyDecisionReferenceInputV1,
} from "./parser";

export const ECB_MONETARY_POLICY_SCHEDULE_CACHE_SECONDS_V1 = 24 * 60 * 60;
export const ECB_MONETARY_POLICY_DOCUMENT_CACHE_SECONDS_V1 = 24 * 60 * 60;

/** One shared server entry owns the complete Governing Council schedule. */
const getCachedScheduleV1 = unstable_cache(
  async () => ecbMonetaryPolicyClientV1.getSchedule(),
  ["chronoverse", "providers", "ecb", "monetary-policy-schedule-v1"],
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
  return getCachedScheduleV1();
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
