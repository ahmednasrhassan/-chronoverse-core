# AWS Newsletter independence ? implementation result

**IMPLEMENTED AND TESTED LOCALLY. NOT DEPLOYED; NOT ACTIVATED; NOT PRODUCTION-READY.**

Preparation began 25 October; final verification/reporting concluded 26 October 2026 (Africa/Cairo). Filenames retain the task-start date.

The current checkout matched the private review ZIP before editing. HEAD remains `dea9254fb82b90076671d58e884dd58ba61eb1eb`, branch `master`; nothing was staged, committed, pushed or switched. Existing resources and the CloudFormation Change Set were not accessed or modified.

The [operating contract](newsletter-aws-independence-2026-10-25.md) covers public routes, S3 schema, source approval/cutover, retained safeguards, costs and recovery. The [exact inventory](newsletter-aws-independence-inventory-2026-10-25.json) records file hashes and reasons.

## Exact changes

| File | Required change |
| --- | --- |
| `docs/newsletter-aws-owner-guide-2026-10-24.md` | Mark website-dependent instructions/artifacts historical and link the independent runtime contract. |
| `docs/newsletter-owner-deployment-runbook-2026-10-24.md` | Preserve approval boundaries; identify new inputs/module inventory and prohibit executing the old Change Set as this revision. |
| `services/newsletter/README.md` | Make the current independent architecture and remaining approval gates the authoritative entry point. |
| `services/newsletter/package.json` | Promote already-installed locked Smithy signing/checksum packages to direct pinned dependencies without a download. |
| `services/newsletter/package-lock.json` | Record only the two direct dependency promotions; preserve every package resolution/integrity. |
| `services/newsletter/src/aws.mjs` | Select S3 content, retain a monotonic conditional checkpoint and atomic campaign snapshot guard using existing DynamoDB permissions, and construct one-click headers. |
| `services/newsletter/src/discovery.mjs` | Preserve original source provenance while retaining existing deterministic windows, deduplication and campaign selection. |
| `services/newsletter/src/domain.mjs` | Require durable content-source approval for digest sends; identify old RSS constants as compatibility-only. |
| `services/newsletter/src/rss.mjs` | Carry the independently generated unsubscribe URL to the mail adapter; retain optional legacy parser/fetch regression coverage. |
| `services/newsletter/src/service.mjs` | Use the independent public origin and public HTTP wrapper; require explicit current content approval/provenance before campaigns or sends. |
| `services/newsletter/template.json` | Configure existing content bucket/key and independent origin, add AWS-owned/legacy management routes, and grant only gated exact-key planner S3 reads. |
| `services/newsletter/test/discovery.test.mjs` | Supply explicit synthetic approval metadata through the legacy parser fixture without removing any existing assertion. |
| `services/newsletter/test/fixture.mjs` | Supply an independent synthetic origin and explicit synthetic archive/campaign approval evidence. |
| `services/newsletter/test/template.test.mjs` | Add route, independence and exact-key S3 permission checks while retaining the original activation/security assertions. |
| `services/newsletter/src/content.mjs` | Validate explicitly approved, fresh, versioned S3 content with original provenance, cutover rules and anti-rollback state. |
| `services/newsletter/src/http.mjs` | Serve accessible AWS registration and safe management forms, trusted API Gateway client limiting, POST/one-click transitions and legacy path aliases. |
| `services/newsletter/content-manifest.example.json` | Provide an intentionally unapproved/invalid draft; manufacture no actual publication evidence. |
| `services/newsletter/scripts/content.mjs` | Provide offline counts/hash-only manifest inspection with no approval, upload or cloud operation. |
| `services/newsletter/test/content.test.mjs` | Exercise archive approval, timestamps/provenance, history prevention, outages, signed reads and checkpoint races with synthetic transports. |
| `services/newsletter/test/public-http.test.mjs` | Exercise independent public flows, anti-abuse, token/GET/POST safety, one-click/legacy continuity and suppression without emails or AWS calls. |
| `docs/newsletter-aws-independence-2026-10-25.md` | Document the implemented contract, founder decisions, cost assumptions, migration/recovery limits and artifact replacement requirements. |
| `docs/newsletter-aws-independence-implementation-2026-10-25.md` | Record exact scope, validation evidence, preservation and final readiness status. |
| `docs/newsletter-aws-independence-inventory-2026-10-25.json` | Provide the machine-readable final changed-file inventory and validation evidence. |

## Verification

- **193/193** final service tests passed: all 153 original service cases plus 40 added cases; zero failures, skips, cancellations or TODOs. Existing test assertions were not weakened or removed.
- Source and locally translated SAM both passed **32/32** activation combinations. A separate source matrix also checks exact-key S3 read isolation for configured/unconfigured buckets across all 32 combinations.
- `sam validate --lint --template-file services/newsletter/template.json --region eu-north-1` passed with AWS API/socket calls denied. Local synthetic translation: **38 authored / 50 translated resources**, including eight additional generated invocation permissions, no new service or authored resource.
- Focused ESLint passed for 13 changed JavaScript files; the final alias edits were separately linted in their three affected files. Service syntax/safety checks passed.
- Existing runner: `node services/newsletter/scripts/test.mjs` under installed Node 22.23.4. In-memory execution harness preserved its environment sanitization/offline guard and additionally denied private authentication-file reads. No test changes to the runner were needed. All private authentication read counters were zero; AWS-denying Python guard counters were zero.
- Tests exercised mocked SDK/HTTP transports only. No actual SES send, subscriber operation, S3 upload, real AWS API or production credential access occurred.
- Initial 187/189 run found two original IAM invariants violated by a proposed permission expansion. That expansion was removed; conditional writes reuse the original DynamoDB permissions instead. An affected-file retry passed 124/124; subsequent full service runs passed 192/192 and then 193/193 after adding legacy aliases. Initial failure evidence remains preserved.
- First SAM lint attempt failed because the sanitized environment lacked a home directory. An empty task-local profile resolved the tooling issue; all attempts recorded zero AWS/socket calls. No permissions or network restrictions were relaxed.

Raw local evidence (intentionally outside Git): `.verification/newsletter-independence-20261025/`, including `newsletter-tests-release.log`, `newsletter-tests-release-result.json`, `sam-validate-release.log`, `sam-validation-release-result.json`, `condition-matrix.json`, `translation-result.json`, lint logs and pre-change hashes. The processed local template contains only synthetic artifact references and is not a deployable artifact.

## Preserved / unverified

All 190 existing website source files and the complete encrypted local backup tool remain byte-identical. Lambda handlers, feedback/contact synchronization, migration tooling, queues, Scheduler, SES identity/secret references, monitoring, encryption/PITR/deletion protection, send lease and uncertain-send logic remain. Pre-existing deletions/unrelated edits are preserved. No source file was deleted by this task.

The private review ZIP and old runtime ZIP/release template still match their original hashes. They are historical snapshots, not the changed implementation. No Lambda or website build was run. Production ARM64 behavior, deployed IAM, delivered SES one-click headers, actual S3 bucket compatibility/billing and full AWS restoration remain **UNVERIFIED**. Historical backup tests (44/44) were not repeated because the tool is unchanged.

## Remaining founder decisions and minimum next actions

1. Approve the real public HTTPS API origin and separately resolve reachability of already-mailed legacy hostnames/paths. Both old management path aliases are implemented; DNS/TLS/hosting changes were not made.
2. Approve exact S3 bucket/prefix isolation, versioning, encryption/key policy, retention and publishing authority. Existing artifact-bucket reuse was not assumed. Select the real original publication evidence/approvers, explicit cutover timestamp, approval/revocation process and weekly freshness cadence. This task provides the read adapter/schema and offline validator, not an invented editorial approval or a live publisher/upload operation.
3. Review the updated local source privately; authorize fresh local dependency/package inspection and release ZIP/template generation before any upload. Separately approve metadata preflight and any newly reviewed replacement change set. Do not execute the old Change Set for this revision.
4. Before activation, complete synthetic managed-service tests, actual SES non-send API pacing/quota contention and one-click-header verification, monitoring/incident ownership, lawful consent/address/privacy and payment continuity, legacy sender/key/suppression reconciliation and a controlled AWS recovery exercise.

All five SAM activation defaults remain false. Content approval and cutover are not seeded; source/origin defaults remain unconfigured. No production publishing, import, registration or sending was enabled.

Cost model reuses the saved 24 October Stockholm evidence: paused $1.46?1.60/month, 100 weekly subscribers $2.06?2.30, 1,000 $2.82?3.10, plus modeled incremental usage below $0.01/month for the documented modest content-history/page-visit assumptions. No new fixed service is added. These scenarios remain below approximately $4 before tax, but no account bill, credits, SES plan/add-ons, KMS, traffic or actual runtime duration was verified. This is not a spending cap.

**Status: local independent runtime implemented/tested with safe disabled defaults. Live editorial publishing is unconfigured pending explicit policy/evidence decisions; production deployment/activation/recovery readiness is not claimed.**
