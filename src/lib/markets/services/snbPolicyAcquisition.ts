import { assertSnbPolicyServerV1, snbPolicyDocumentUrlV1, SnbPolicyTransportError,
  type SnbPolicyDocumentLoaderV1 } from "../providers/snb/transport";
import { parseSnbPolicyDocumentV1, SnbPolicyValidationError } from "../providers/snb/facts";
import { buildSnbPolicyEvidenceV1 } from "../providers/snb/canonical";
import { SnbPolicyVintagePersistenceError, type SnbPolicyVintageAdapterV1 } from "../persistence/snbPolicyVintageRedis";
import type { SnbPolicyAppendResultV1 } from "../persistence/snbPolicyVintageRedis";

export interface SnbPolicyAcquisitionDependenciesV1 {
  readonly loadDocument: SnbPolicyDocumentLoaderV1;
  readonly nowUnixSeconds: () => number | Promise<number>;
  readonly appendVintage: SnbPolicyVintageAdapterV1["append"];
}

export type SnbPolicyAcquisitionResultV1 =
  | { readonly status: "acquired" | "unchanged" | "stale" | "conflict"; readonly persistence: SnbPolicyAppendResultV1 }
  | { readonly status: "unsupported-regime" }
  | { readonly status: "provider-failure"; readonly code: SnbPolicyTransportError["code"] }
  | { readonly status: "validation-failure"; readonly code: SnbPolicyValidationError["code"] | "invalid-request" | "invalid-current" }
  | { readonly status: "persistence-failure"; readonly code: SnbPolicyVintagePersistenceError["code"] }
  | { readonly status: "clock-failure" }
  | { readonly status: "cancelled" };

/** INACTIVE. Explicit dated acquisition through injected loader/clock/storage only. */
export async function acquireSnbPolicyV1(
  decisionDate: string, signal: AbortSignal, dependencies: SnbPolicyAcquisitionDependenciesV1,
): Promise<SnbPolicyAcquisitionResultV1> {
  assertSnbPolicyServerV1();
  try {
    if (signal.aborted) return { status: "cancelled" };
    const url = snbPolicyDocumentUrlV1(decisionDate);
    const document = await dependencies.loadDocument(url, signal);
    if (signal.aborted) return { status: "cancelled" };
    const fact = parseSnbPolicyDocumentV1(document, decisionDate);
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
    const evidence = buildSnbPolicyEvidenceV1(fact, fetchedAt);
    if (signal.aborted) return { status: "cancelled" };
    const persistence = await dependencies.appendVintage(decisionDate, evidence);
    // Cancellation during a successful immutable append cannot undo that capture.
    return { status: persistence.status === "initialized" || persistence.status === "advanced" ? "acquired" : persistence.status, persistence };
  } catch (error) {
    if (error instanceof SnbPolicyValidationError && error.code === "unsupported-regime") return { status: "unsupported-regime" };
    if (error instanceof SnbPolicyValidationError) return { status: "validation-failure", code: error.code };
    if (error instanceof SnbPolicyTransportError) {
      if (error.code === "unsupported-regime") return { status: "unsupported-regime" };
      if (error.code === "aborted") return { status: "cancelled" };
      return error.code === "invalid-request" ? { status: "validation-failure", code: error.code }
        : { status: "provider-failure", code: error.code };
    }
    if (error instanceof SnbPolicyVintagePersistenceError) {
      return error.code === "invalid-current" ? { status: "validation-failure", code: error.code }
        : { status: "persistence-failure", code: error.code };
    }
    throw error;
  }
}
