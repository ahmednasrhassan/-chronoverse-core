# Lambda quota-ten compatibility

> Historical technical record. The [minimum-cost review](newsletter-minimum-cost-2026-10-24.md) and its inventory supersede the alarm counts, retention, cost estimates and release-artifact references below. Quota-ten and sending-safety findings remain applicable.

24 October 2026. Local-only correction. **Concurrency-compatible for disabled-mode provisioning under the owner-confirmed Stockholm account quota of ten. Actual provisioning and live activation remain unapproved.** This report and the [new file/resource/artifact inventory](newsletter-lambda-quota-compatibility-inventory-2026-10-24.json) supersede the previous nine-reservation template and build. No AWS account API, provisioning, upload, secret retrieval, subscriber access, email, production setting, commit, push or deployment was used.

## Cause and correction

The previous functions requested reservations `2, 2, 1, 2, 2`. AWS requires 100 unreserved executions to remain when allocating reservations; those requests cannot work with this account's quota ten. All five `ReservedConcurrentExecutions` properties were removed, without adding provisioned concurrency or changing the five false activation defaults. No quota increase, paid-plan upgrade or new AWS resource is needed for this compatibility correction. Remaining IAM/service/credit/account checks still apply. [AWS concurrency rules](https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html)

Deleting the worker reservation alone would remove its serial-send assumption. The real SES adapter now uses an atomic conditional DynamoDB lease shared by **all digest and confirmation sends**, including direct adapter calls. It rechecks runtime and durable controls, current subscriber state, account suppression and contact preferences after acquiring ownership. It starts at most one newsletter `SendEmail` request at a time; the owner releases only after the SDK request settles and imposes a one-second cooldown. There are no SDK retries for SendEmail. This is a conservative application handoff limit below the owner's 14/second quota; transactional email and other deployments still consume the same SES account quota.

`RATE#SES_SEND_GATE` has no TTL. Acquisition requires no existing record or numeric expired `leaseUntil`; corrupt state denies sending. Owners are per-call nonces. Release conditionally matches the owner, preventing an old invocation from unlocking a successor. An abandoned lease expires after **120 seconds**, twice the fixed **60-second Lambda timeout**; a previous invocation must have ended before recovery. No renewal, background send, expired-owner retry or manual force-unlock is introduced. Tests bind the lease margin to every function timeout; changing either requires review. This relies on the normal AWS runtime clock and invocation lifetime; it is not a distributed transaction with SES. A request already handed to SES cannot be recalled.

## Invocation and retry review

| Path | Revised control and limitation |
| --- | --- |
| Planner SQS | `MaximumConcurrency=2`, batch one, partial failures; mappings stay disabled by default. Atomic article/campaign and canonical-URL claims unchanged. Concurrent planning can duplicate queue entries, not issue/recipient sends. |
| Digest SQS | `MaximumConcurrency=2`, batch one, partial failures. **Two is concurrent, not sequential.** Global SES lease supplies independent serialization; recipient claims still provide send idempotency. |
| Feedback SQS | `MaximumConcurrency=2`, enabled while sending is paused. Safety events do not acquire a send lease. Source/topic validation and idempotent suppression/audit remain intact. |
| Contact stream | Explicit `ParallelizationFactor=1` per shard, batch ten, `TRIM_HORIZON`, partial failures/bisection; five function-error retries, 24-hour maximum age and failure destination retained. More shards can still invoke concurrently. |
| HTTP API | Existing 2 requests/second, burst five targets retained. These are best-effort throttles, not concurrency reservations. Unsubscribe/confirmation/registration share the API Lambda and regional pool. |
| Scheduler | Disabled by default; queues planner work rather than directly sending. Existing bounded retry/DLQ unchanged. No Vercel Cron or Sanity dispatch dependency. |
| Manual/direct invocation | Still subject to code gates, durable CONTROL and SES lease. No new public Lambda URL or invocation grant. Privileged IAM/account changes can bypass code and remain an external control. |

SQS maximum concurrency is free to configure and must be at least two. The three mappings can collectively consume six executions. This does **not** reserve the other four: stream shards, HTTP requests, direct invocations and unrelated functions can compete for all ten. Do not claim guaranteed unsubscribe capacity. API clients can receive 429/503 under contention and must retry; the application never reports a successful opt-out before the durable suppression write. [SQS scaling and limits](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-scaling.html), [CloudFormation minimum](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-lambda-eventsourcemapping-scalingconfig.html), [HTTP throttle limits](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-throttling.html)

For any future activated system, the approved incident plan should pause enrollment/delivery and their producer/consumer mappings first under sustained pressure, while keeping unsubscribe/feedback/contact safety available. Do not disable all Lambda execution, set API concurrency to zero, erase queues/claims or change account-wide SES sending as an overload workaround. Such production actions require separate authorization; none was taken here.

There are three distinct send outcomes:

1. **Local capacity denial before SES:** a typed internal error proves no SES request started. Digest processing conditionally returns only a current `CLAIMED` record to `RETRYABLE` and refunds that local attempt. This does not consume the separate three-attempt SES rejection budget. SQS receives a partial failure; it still has its existing five receives, 360-second visibility and 14-day retention. A later suppression or expired 72-hour campaign stops delivery before SES. A confirmation denied capacity returns truthful 503/`NOT_SENT`, leaves the subscriber pending, and is not automatically retried; the existing daily enrollment limit remains. This is a known enrollment availability tradeoff, requiring approval before opening registration.
2. **Explicit SES HTTP 429 rejection:** retryable up to the existing three attempts. It never refunds an actual SES attempt. SDK automatic sending retries remain one.
3. **Uncertain handoff or persistence:** timeouts, missing MessageId, lost lease acquire/release acknowledgement, lost delivery-result acknowledgement and crashes remain held (`CLAIMED`/`UNKNOWN`). Redelivery or lease expiry cannot reset those claims. A lookalike SDK error cannot masquerade as local capacity denial.

The send lease never gates unsubscribe, durable suppression, bounce/complaint processing or contact opt-out synchronization. A lease crash may delay mail but cannot reactivate a subscriber. Replayed/revoked/expired confirmations and atomic CONTROL+nonce validation are unchanged. Signup stays code-paused, `vercel.json` retains no cron, and no CONTROL/subscriber/list seed or import is added.

**Bounded retry is not a lossless queue guarantee.** Exhausted/expired SQS events need operator review. Stream failure messages contain invocation metadata, not a complete replay of expired stream records. The authoritative subscriber ledger and SES suppressions must remain intact. Before activation, managed-service tests and an incident owner must verify Lambda `Throttles`/regional concurrency, API 429/5xx, stream `IteratorAge`, SQS oldest-message age, dead letters and the existing held/throttled metrics. The existing custom `Throttled` alarm alone does not cover Lambda invocation throttles. No new monitoring resource or alert subscription was added in this minimal correction. [SQS failures](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-errorhandling.html), [stream concurrency](https://docs.aws.amazon.com/lambda/latest/dg/with-ddb.html), [discarded stream records](https://docs.aws.amazon.com/lambda/latest/dg/services-dynamodb-errors.html)

**SES management-call capacity remains a live-activation blocker.** AWS documents a separate one-request/second limit for non-send SES API actions; the owner's 14/second send quota is not a budget for `GetContact`, `GetSuppressedDestination` or contact synchronization. The service's prechecks plus final adapter rechecks, enrollment/confirmation and stream work can contend for these limits. The send lease serializes `SendEmail`, not every SES management action across the application. Rejections fail closed and may exhaust bounded retries or leave held mail; throughput is not validated. Before enabling controls, separately review pacing/backoff for these operations and test it with approved synthetic managed resources. Do not remove safety checks or increase concurrency to bypass throttling. This does not prevent provisioning empty resources with every control false. [SES API quotas](https://docs.aws.amazon.com/ses/latest/dg/quotas.html)

## Cost and resource impact

No resource or IAM action was added. Inventory remains **45 authored / 49 locally translated resources**, with the same six roles, one ledger, four queues, five functions, eleven alarms, isolated SES list/configuration and existing secret/domain references. Gate writes use the API/worker's existing ledger GetItem/UpdateItem permissions. The gate has no audience-index key and is excluded by the subscriber stream invocation filter. No paid concurrency, provisioned poller, FIFO queue, extra secret, S3 bucket, SES identity or data import was introduced.

Removing reservations has no fixed-price saving: reserved concurrency itself had no charge. SQS caps have no configuration charge but can prevent the low-traffic polling optimization, increasing request usage. Successful uncontended sends add two small nontransactional gate writes and two small strongly consistent reads; additional control/provider checks and contention/retries also consume resources. Using the previously verified Stockholm Standard rates ($0.67/million WRUs and $0.1345/million RRUs), that nominal gate/read increment is approximately **$1.61 per million sends** before allowances. Failed conditional writes also consume write capacity. This is an incremental estimate, not a traffic/spending guarantee. [DynamoDB capacity accounting](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/read-write-operations.html)

Updated gross monthly credit-consumption budgets, before tax/shared allowances, retaining the previous 4.345 issues/month plus 10% confirmations and SES Essentials $0.16/1,000 assumption:

| Audience | Messages/month | Nominal added gate/read cost | Updated total budget |
| --- | ---: | ---: | ---: |
| Zero, disabled | 0 | $0 send usage | $1–5/month |
| 1,000 | 4,445 | about $0.01 | $4–11/month |
| 10,000 | 44,450 | about $0.07 | $10–21/month |
| 100,000, hypothetical only | 444,500 | about $0.72 | $80–105/month |

These include conservative polling/retry headroom, not a quote. Check actual SES plan, credits, expiry and eligibility privately; do not upgrade. The 100,000 row is **not** approved capacity: daily SES quota 50,000, 72-hour campaigns, shared concurrency, serialization/cooldown, confirmation traffic, retries and incident capacity require a separate throughput review. The Free Plan can close the account at credit exhaustion/expiry and interrupt unsubscribe; continuity remains an activation blocker. Previous cost assumptions and public price evidence remain preserved. [SES pricing](https://aws.amazon.com/ses/pricing/), [Free Plan lifecycle](https://aws.amazon.com/free/free-tier-faqs/)

## Verification, artifacts and decision

| Verification | Final result |
| --- | --- |
| Full repository regressions | **239 passed**: safety 10, authentication 21, public site 79, content 24, newsletter 105; zero failures/skips/deferred tests |
| Backend with actual SAM-built dependencies | **105 passed** |
| Focused ESLint and service syntax/safety checks | Pass |
| Clean locked dependency installation/tree | `npm ci` and `npm ls --all` pass; approved service/root lockfiles unchanged |
| `sam validate --lint`, `eu-north-1` | Source and reviewed release template pass |
| `sam build`, Node 22 / ARM64 target | Pass, `NpmCI` verified; no AWS execution/container used |
| Activation condition matrix | All 32 combinations checked; defaults grant no SendEmail, disable Scheduler/config-set sending and planner/worker mappings |
| Runtime smoke | ZIP runtime bytes match built modules; handler loading, 405 before secret/storage reads, missing-control denial and synthetic DynamoDB marshalling pass against built dependencies |

Source inputs are explicitly staged; no environment files, private address, subscriber data, migration CLI, tests, reports or backups are deployed. Website build/typecheck/full-site lint are not rerun: website/configuration hashes remain unchanged from the previous successful checks. Confirmation crypto/atomic persistence, existing confirmation tests, RSS discovery/backlog, unsubscribe, suppression and feedback work remain preserved.

Preservation checks passed: 266 pre-task backup entries verified, 201 website/configuration hashes unchanged, nine existing files changed, three files added and no file removed. HEAD remains `dea9254fb82b90076671d58e884dd58ba61eb1eb` on `master`; all prior artifacts and backups remain available. The inventory separates these edits from pre-existing uncommitted work and deletions.

New output root: **`E:\cv-nl-quota-20261024-172921`**. Use only `release-template.json` and **`packages-release/newsletter-runtime.zip`**. One shared ZIP serves five functions, contains **4,123 files**, and is **4,188,511 compressed / 12,439,021 uncompressed bytes**. SHA-256: **`6a644693848126f9a83c2a14eb799be28d670c22b949de31a1beaa29ccd6d308`**. Detailed resources, policies, current file changes and artifact locations are in the companion inventory; local per-entry hashes/logs are under `.verification/newsletter-quota-compatibility-20261024-172921Z/`.

Every final archive entry was read back and hashed. Its first-party bytes match all five SAM-built function modules. The service package/lock are unchanged, so third-party bytes were reused from the previous checksum-verified inspected ZIP; fresh clean installs/builds and 105 tests against the newly built dependency tree passed independently. The initial full directory-scan/ZIP attempt exceeded a local timeout and left a partial sibling `packages/` file. That partial output/logs were preserved, excluded from the release template and must not be uploaded. The previous release output also remains preserved and obsolete for deployment. This avoids claiming all five dependency directories were newly rehashed. Initial local harness/home-profile failures are retained; the final checks above pass. No managed Linux/ARM64 or real DynamoDB/SES execution was performed.

**Provisioning decision:** the reservation incompatibility is removed. Disabled-mode creation is compatible with a ten-concurrency account on the reviewed definitions, subject to owner-approved change-set/IAM/resource/account checks. Local validation does not prove managed-service permissions or runtime behavior. Do not provision until explicitly approved.

Rollback must retain zero reservations and the shared-gate/claim safety contract under quota ten; the preserved older nine-reservation template is not a valid rollback target. A future UPDATE that removes an already deployed reservation may require the approved CloudFormation role's `lambda:DeleteFunctionConcurrency` permission. The owner reports no active stack; no such update was attempted or assumed here.

**Activation decision: NO-GO.** Preserve all previous historical-unsubscribe, suppression recovery, legacy sender containment, secret metadata, consent/address, website release, monitoring, credit continuity and managed-service gates. Additionally resolve SES non-send API pacing, approve low-quota load/retention testing and the confirmation-capacity tradeoff. No claims are made about old immutable deployments being disabled.

Follow the updated [owner runbook](newsletter-owner-deployment-runbook-2026-10-24.md). All AWS approvals remain separate; no provisioning/upload action has been performed.
