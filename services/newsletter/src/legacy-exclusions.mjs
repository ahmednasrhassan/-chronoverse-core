import snapshot from "./legacy-publication-exclusions.json" with { type: "json" };
import { hash } from "./domain.mjs";

// Pinned independently of the data file: missing, edited, truncated, reordered
// or namespace-mismatched baselines fail closed, never become an empty list.
export const LEGACY_SNAPSHOT_SHA256 = "25bb03a09769f53ff429b82000cf3cab738d42b9daccdb36f54a50675d7ac6d5";
const validId = id => typeof id === "string" && /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(id) && !/^(drafts|versions)\./.test(id);
export function verifyLegacySnapshot(value) {
  if (!value || hash(JSON.stringify(value)) !== LEGACY_SNAPSHOT_SHA256 || value.version !== 1 ||
      value.project !== "xfs4j01p" || value.dataset !== "production" || value.apiVersion !== "2024-03-01" || value.perspective !== "published" ||
      value.cutover !== "2026-10-24T21:00:00.000Z" || value.publishedCount !== 73 || value.firstNewId !== "post-99-1785240729810" ||
      !Array.isArray(value.publishedIds) || value.publishedIds.length !== 73 || !Array.isArray(value.excludedIds) || value.excludedIds.length !== 72 ||
      new Set(value.publishedIds).size !== 73 || value.publishedIds.some(id => !validId(id)) ||
      JSON.stringify(value.publishedIds) !== JSON.stringify([...value.publishedIds].sort()) ||
      !value.publishedIds.includes(value.firstNewId) ||
      JSON.stringify(value.excludedIds) !== JSON.stringify(value.publishedIds.filter(id => id !== value.firstNewId))) {
    throw new Error("legacy_exclusion_snapshot_invalid");
  }
  return Object.freeze({ project: value.project, dataset: value.dataset, excludedIds: Object.freeze([...value.excludedIds]) });
}
const verified = verifyLegacySnapshot(snapshot);
export function legacyExclusionIds(config) {
  if (config?.project !== verified.project || config?.dataset !== verified.dataset) throw new Error("legacy_exclusion_source_mismatch");
  return verified.excludedIds;
}
export const legacyPublicationExcluded = (config, id) => legacyExclusionIds(config).includes(id);
