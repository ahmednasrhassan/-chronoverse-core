# BASE source reference for the four unchanged Lambdas

PlannerFunction, WorkerFunction, FeedbackFunction and ContactSyncFunction retain
BASE archive SHA256 `89636d5a22d004e9274a0a6190a46de1904a2c7516cfa70624f62845a3f258c8`.
This is a source snapshot, not another package or deployment request.

The BASE archive and PATCHED API archive contain the same 14 source paths.
Eleven have identical bytes. These three files preserve the differing BASE
versions of `aws.mjs`, `http.mjs` and `service.mjs`. The
[source provenance manifest](../deployment-reviewed-2026-10-28.json) records every
BASE/PATCHED source hash and maps each source set to its actual Lambda resources.

Combining the current shared eleven files with these three overrides describes
the full BASE application source without committing its dependency archive.
Keep the original locked dependencies/immutable archive separately. Fresh ZIP
recompression is not asserted to reproduce its checksum.

**Never copy these overrides onto the live PATCHED API or current `src/` tree.**
The API confirmation correction must remain deployed; the other four functions
must retain their verified BASE code unless a different release is approved.
