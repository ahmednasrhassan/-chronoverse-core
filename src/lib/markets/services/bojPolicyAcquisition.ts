import { assertBojPolicyServerV1, bojPolicyDocumentUrlV1, BojPolicyTransportError,
  type BojPolicyDocumentLoaderV1 } from "../providers/boj/transport";
import { parseBojPolicyDocumentV1, BojPolicyValidationError } from "../providers/boj/facts";
import { buildBojPolicyEvidenceV1 } from "../providers/boj/canonical";
import { BojPolicyVintagePersistenceError, type BojPolicyVintageAdapterV1 } from "../persistence/bojPolicyVintageRedis";
import type { BojPolicyAppendResultV1 } from "../persistence/bojPolicyVintageRedis";

export interface BojPolicyAcquisitionDependenciesV1 {
  readonly loadDocument: BojPolicyDocumentLoaderV1;
  readonly nowUnixSeconds: () => number | Promise<number>;
  readonly appendVintage: BojPolicyVintageAdapterV1["append"];
}

export type BojPolicyAcquisitionResultV1 =
  | { readonly status: "acquired" | "unchanged" | "stale" | "conflict"; readonly persistence: BojPolicyAppendResultV1 }
  | { readonly status: "provider-failure"; readonly code: BojPolicyTransportError["code"] }
  | { readonly status: "validation-failure"; readonly code: BojPolicyValidationError["code"] | "invalid-request" | "invalid-current" }
  | { readonly status: "persistence-failure"; readonly code: BojPolicyVintagePersistenceError["code"] }
  | { readonly status: "clock-failure" }
  | { readonly status: "cancelled" };

/** INACTIVE. Explicit dated acquisition through injected loader/clock/storage only. */
export async function acquireBojPolicyV1(
  decisionDate: string, signal: AbortSignal, dependencies: BojPolicyAcquisitionDependenciesV1,
): Promise<BojPolicyAcquisitionResultV1> {
  assertBojPolicyServerV1();
  try {
    if (signal.aborted) return { status: "cancelled" };
    const url = bojPolicyDocumentUrlV1(decisionDate);
    const document = await dependencies.loadDocument(url, signal);
    if (signal.aborted) return { status: "cancelled" };
    const fact = parseBojPolicyDocumentV1(document, decisionDate);
    if (signal.aborted) return { status: "cancelled" };
    // Complete document/fact validation and source normalization precede the trusted clock.
    let fetchedAt: number;
    try { fetchedAt = await dependencies.nowUnixSeconds(); }
    catch (error) {
      if (error instanceof TypeError || error instanceof ReferenceError) throw error;
      return { status: "clock-failure" };
    }
    if (!Number.isSafeInteger(fetchedAt) || fetchedAt < 0) return { status: "clock-failure" };
    if (signal.aborted) return { status: "cancelled" };
    const evidence = buildBojPolicyEvidenceV1(fact, fetchedAt);
    if (signal.aborted) return { status: "cancelled" };
    const persistence = await dependencies.appendVintage(decisionDate, evidence);
    // Cancellation during a successful immutable append cannot undo that capture.
    return { status: persistence.status === "initialized" || persistence.status === "advanced" ? "acquired" : persistence.status, persistence };
  } catch (error) {
    if (error instanceof BojPolicyValidationError) return { status: "validation-failure", code: error.code };
    if (error instanceof BojPolicyTransportError) {
      if (error.code === "aborted") return { status: "cancelled" };
      return error.code === "invalid-request" ? { status: "validation-failure", code: error.code }
        : { status: "provider-failure", code: error.code };
    }
    if (error instanceof BojPolicyVintagePersistenceError) {
      return error.code === "invalid-current" ? { status: "validation-failure", code: error.code }
        : { status: "persistence-failure", code: error.code };
    }
    throw error;
  }
}
