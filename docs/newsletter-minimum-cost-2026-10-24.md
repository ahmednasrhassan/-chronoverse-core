# Newsletter minimum-cost review — 24 October 2026

**LOCAL ONLY. Cost optimization implemented; provisioning and live activation remain unapproved.** The cheapest safe choice while activation is blocked is to defer deploying the stack. Nothing in this review changes AWS resources, SES/account plans, secrets, data, emails, Vercel, DNS or Sanity. All five activation parameters remain `false`; durable `CONTROL` approval is still required. The existing secret is retained.

This report supersedes previous cost estimates and package references, while preserving the [quota-ten review](newsletter-lambda-quota-compatibility-2026-10-24.md), confirmation fix and RSS implementation. Use the updated [owner runbook](newsletter-owner-deployment-runbook-2026-10-24.md) and [resource/change inventory](newsletter-minimum-cost-inventory-2026-10-24.json).

## Implemented savings and visibility

| Configuration | Before | After | Gross saving, before allowances |
| --- | --- | --- | --- |
| Standard alarms | 11 alarms / 11 underlying metrics | 4 alarms / **8 underlying metrics** | **$0.30/month** ($1.10 → $0.80) |
| Application EMF | Separate metric for each diagnostic signal | Normal signals stay in logs; one dimensionless `SafetyFailure` metric for faults | Usage-dependent; no savings from absent idle emissions |
| Five diagnostic log groups | 30 days | **14 days**, retained on deletion | About 53% less steady-state archival storage at uniform ingestion; ingestion charged separately |
| Functions, queues, ledger, safety consumers and concurrency | Existing quota-compatible topology | Preserved | No safety tradeoff for negligible additional savings |

Metric-math alarms are charged for every underlying metric. Four alarms do **not** mean $0.40/month. Custom metrics are prorated by hours of publication, not necessarily full monthly series fees. Consolidating sparse weekly success signals therefore saves pennies rather than the full-month maximum implied by multiplying every signal by $0.30. [CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/)

Four alarm groups retain and extend actionable detection:

| Alarm | Inputs / trigger | Purpose |
| --- | --- | --- |
| `DeadLetterAlarm` | Failure queue visible messages ≥1 | Exhausted queue/stream/Scheduler recovery |
| `ExecutionHealthAlarm` | `MAX(Errors, Throttles)` ≥1 in five minutes | Native Lambda failures, including invocations rejected before application logging |
| `SafetyFailureAlarm` | `SafetyFailure` ≥1 in five minutes | Held/uncertain sends, provider/API/queue failures, throttling, expired campaigns, hard bounces and complaints |
| `SafetyBacklogAlarm` | Maximum of three queue ages and contact-stream age ≥1 hour | Delayed feedback, consent synchronization, planning and digest processing |

Execution metrics have no dimensions and cover the **entire regional account**, including unrelated Lambda functions. This saves per-function alarm duplication; investigate individual function metrics after an alert. [Lambda aggregate dimensions](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics-view.html) Stream age is converted from milliseconds to seconds before comparison. Queue ages are approximate. This is operational failure detection, not a guarantee of delivery or opt-out latency. A retained claim with an uncertain outcome raises `Held`; it is never automatically resent. These signals count processing outcomes, not unique recipients or guaranteed exactly-once events.

Fault details remain bounded `signal` fields in structured logs. Bounce/complaint signals follow successful durable suppression; they cannot replace suppression or trigger reactivation. Normal `Accepted`, `Delivered`, `Suppressed`, `Confirmed`, `Paused`, `ContactSynced`, discovery and duplicate diagnostics remain visible without publishing paid custom metrics. Unknown signal text is replaced by `UnknownSignal`; no emails, tokens, bodies or caller-provided dimensions are logged.

`AlarmTopicArn` is still empty by default. Alarms exist and show state, but **out-of-band notification is not configured**. A reviewed destination and incident owner remain mandatory before activation. Do not use the SES feedback topic as the alarm destination: alarm envelopes are not SES feedback and could create a failure loop. No subscription or test email was created. A single fault metric loses automatic per-category alarm labels; operators use the following query across the five function log groups, limited to a short time range:

```sql
fields @timestamp, @log, signal, count
| filter event = "newsletter"
| stats sum(count) as outcomes by signal, bin(5m)
```

Logs Insights scans are chargeable. Do not enable body/header logging or automatic broad scheduled queries. Fourteen days covers two weekly cycles and the queues' 14-day retention; investigate alerts promptly. Durable consent, suppression, migration evidence and article/send claims remain in DynamoDB without new TTLs. Diagnostic logs are not the compliance record. Preserve private incident evidence separately under the approved retention policy when needed; no legal hold was identified or removed.

## Resource audit and classification

The optimized definition has **38 authored resources / 42 locally translated resources**. Generated API stage/permissions add four; one external S3 artifact bucket is required but is not created by the template. The companion inventory classifies every logical ID.

| Resource/configuration | Classification | Idle and usage charges / decision |
| --- | --- | --- |
| Ledger table, audience GSI, streams, encryption, PITR, retention and deletion protection | REQUIRED FOR SAFETY | On-demand requests; table/GSI storage; PITR base-table storage. Empty fresh table is negligible. Retained historical data continues costing money while paused. Keep recovery and durable suppression. |
| API Lambda/role/log group, HTTP API and invoke permissions | REQUIRED FOR SAFETY | No fixed Lambda/function/API fee; invocations, execution, requests, logs and secret reads bill on use. Unsubscribe must remain available. API throttles are best effort and cannot cap a hostile bill. |
| Feedback topic/policies/subscription/queue, SES event destination, feedback Lambda/role/logs/mapping | REQUIRED FOR SAFETY | No topic/queue existence fee; SNS/SQS requests, event processing and logs. **Feedback SQS polling remains enabled while paused**, so zero subscribers does not ensure zero request charges. |
| Contact-sync Lambda/role/logs/stream mapping | REQUIRED FOR SAFETY | Polling a Lambda DynamoDB trigger does not add idle Lambda invocations; changes cause processing/SES API calls. Keep historical opt-out synchronization active. |
| Failure queue | REQUIRED FOR SAFETY | No fixed queue storage fee; requests and redrive processing charge. Fourteen-day retention and original recovery settings preserved. |
| Four retained alarm groups | REQUIRED FOR SAFETY | Eight standard alarm metrics: $0.80/month gross. Keep a fault, native failure/throttle, DLQ and backlog signal. Notification destination is separately required. |
| Dedicated SES Contact List/configuration set | REQUIRED FOR SAFETY | No fixed fee identified for these objects; explicit topic opt-out, send denial and event routing preserved. Domain identity is reused, not recreated. |
| Planner and worker Lambdas/roles/logs; plan/digest queues and mappings | REQUIRED FOR OPERATION | Usage only, except active queue polling. Both mappings remain disabled in the default stack; no reserved/provisioned concurrency or paid provisioned pollers. |
| Weekly Scheduler and target role | REQUIRED FOR OPERATION | Disabled schedule performs no weekly invocations; enabled usage is tiny. No fixed schedule fee. |
| Existing Secrets Manager secret, exact-ARN IAM read grants | REQUIRED FOR SAFETY | **$0.40/month even with no deployment/subscribers/emails**, plus API calls. No duplicate secret, caching change, rotation or retrieval. Existing KMS metadata is unknown. |
| External private SSE-S3 artifact bucket | REQUIRED FOR OPERATION | Storage, PUT/GET, retained versions and optional template uploads; no bucket-existence fee. Reuse an approved bucket; do not delete rollback artifacts or add lifecycle deletion without approval. |
| Per-function error alarms and per-signal alarms, success custom metrics, diagnostic retention beyond 14 days | OPTIONAL MONITORING | Removed redundant alarms/normal custom metrics; kept structured diagnostics and safety coverage. No paid dashboard or scheduled query is added. |
| Extra secret/identity, dedicated IPs, SES paid add-ons, provisioned capacity/pollers/concurrency, NAT/VPC endpoints, extra CMK, WAF, custom API domain, tracing/Insights extensions | UNNECESSARY for this topology | None is added by this stack. Existing account add-ons/resources are unknown; do not infer their absence from IaC. Do not enable them incidentally during setup. |

No role permissions, send conditions, function memory/runtime/timeout, stream filters, queue retention/retry/DLQ settings, indexes or encryption were changed. The five separate functions provide IAM isolation and do not themselves incur five fixed fees. Consolidating them would add risk without reducing a fixed per-function charge. No paid CloudWatch dashboard, anomaly detector, high-resolution metric or composite alarm is needed.

## Stockholm rates and cost model

USD, before tax, credits and service allowances; public prices checked 24 October 2026. This is a reproducible planning model, **not an AWS account bill**. No account API or billing data was accessed. The saved public catalog evidence records Stockholm rates and publication dates. See the companion inventory for arithmetic.

| Service | Rate used / relevant condition |
| --- | --- |
| Standard alarm | $0.10 per underlying metric-month |
| Custom metric | $0.30 per metric-month, hourly proration |
| Standard CloudWatch logs | $0.54/GB ingested; $0.028/GB-month archived; ordinary Insights $0.0054/GB scanned |
| Lambda ARM64 | $0.20/million requests; $0.0000133334/GB-second, first duration tier |
| SQS Standard | $0.40/million requests; empty polls count, payloads billed in 64 KB units |
| DynamoDB Standard | $0.67/million WRUs; $0.1345/million RRUs; paid storage tier $0.269/GB-month; PITR $0.21/base-table GB-month |
| HTTP API | $1.06/million requests, first tier |
| Secrets Manager | $0.40/secret-month + $0.05/10,000 API calls |
| S3 Standard | $0.023/GB-month; PUT $0.005/1,000, GET $0.0004/1,000 |
| SNS / Scheduler | SNS Standard request budget $0.50/million; same-region SNS→SQS delivery $0; Scheduler $1/million before allowance |

Regional primary catalogs: [CloudWatch](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonCloudWatch/current/eu-north-1/index.json), [Lambda](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSLambda/current/eu-north-1/index.json), [DynamoDB](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonDynamoDB/current/eu-north-1/index.json), [SQS](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSQueueService/current/eu-north-1/index.json), [HTTP API](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonApiGateway/current/eu-north-1/index.json), [Secrets Manager](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSSecretsManager/current/eu-north-1/index.json), [S3](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/eu-north-1/index.json). [SNS pricing](https://aws.amazon.com/sns/pricing/), [Scheduler pricing](https://aws.amazon.com/eventbridge/pricing/)

**SES plan is a material unknown.** The published Essentials plan has no fixed monthly fee and costs $0.16/1,000 outbound emails; applicable à-la-carte accounts list $0.10/1,000. Pro adds **$105/account/region/month** and Enterprise **$500/month**, plus usage. Outgoing email data costs $0.12/GB. Verification/production access does not establish the pricing plan. This implementation requires neither an upgrade nor paid add-ons. Owner must privately inspect SES/Billing plan, VDM/add-ons, dedicated IPs and any fixed minimums before provisioning; **do not change the plan** as part of this work. [SES pricing](https://aws.amazon.com/ses/pricing/)

SQS polling deserves separate budgeting. The three mappings retain maximum concurrency two for quota-ten safety. AWS documents that maximum concurrency disables its low-traffic reduction to two polling processes. Two is **not** a guarantee of sequential sends or two billable pollers. The inventory retains a 2-to-5 long-poller range at 20 seconds only as sensitivity; the main budget uses **five**, because the two-poller optimization is unavailable with these caps; actual requests require approved billing observation and can be higher under retries or load. One active idle mapping means approximately 259,200–648,000 requests/month; three mean 777,600–1,944,000. Keep the cap, feedback processing and safety lease. [Lambda SQS scaling](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-scaling.html)

Assumptions: 30-day month, 4.345 weekly issues, up to ten public articles/issue, steady confirmed audience with **no new enrollment mail**, 32 KB/email, no attachments/open/click tracking, 256 MB worker averaging two seconds, small planning/feedback work, 10 WRUs and 20 RRUs per digest recipient as an illustrative request budget, table/GSI storage 1/0.5 MB at 100 subscribers or 10/5 MB at 1,000, 5/25 MB monthly logs, one approximately 5 MB release ZIP, no faults, retries or attacks. Request-unit sizes, transactions and GSI writes must be measured at managed validation; the budget is not a guaranteed per-recipient count. History grows durably and cannot be erased to maintain this estimate.

| Monthly scenario | Before optimization, gross | After optimization, gross | Meaning |
| --- | --- | --- | --- |
| A. Existing identified resources, no newsletter stack | $0.40 | **$0.40** | Existing secret only; actual total account/transactional mail/add-ons unknown |
| B. Fresh zero-audience stack, completely paused | about $1.76-1.90 | **about $1.46-1.60** | Includes existing secret, eight alarm metrics and one feedback poller mapping |
| C. 100 subscribers, weekly issue | about $2.36-2.60 | **about $2.06-2.30** | About 435 digest emails/month; three polling mappings; Essentials assumed |
| D. 1,000 subscribers, weekly issue | about $3.12-3.40 | **about $2.82-3.10** | About 4,345 digest emails/month; Essentials assumed |

The ranges budget five idle long-pollers per active mapping and include small workload headroom, not an arbitrary fixed infrastructure fee. Exact illustrative subtotals are in the inventory. Prior success-metric charges and diagnostic-storage differences are additional small variable savings, not included as fixed savings in this comparison. One-time enrollment for 100/1,000 people adds 100/1,000 confirmation emails (approximately $0.016/$0.16 under Essentials) plus requests; repeated signup attempts, failures, extra feeds/records or higher execution duration increase costs. Live cases are hypothetical, **not permission to activate**.

If the account uses eligible à-la-carte SES, steady sending is about $0.026/$0.261 less in C/D. Any Pro/Enterprise minimum, dedicated IPs, customer-managed key, extra secrets/replicas, support plan, unrelated transactional mail or services must be added. These unknowns can dwarf all implemented savings. New stack resources do not modify the existing identity, DNS, transactional send configuration or account-wide suppression.

## Allowances, credits and persistent costs

The gross table deliberately ignores allowances. If all ten eligible standard alarm-metric allowances are unused elsewhere, the new eight can be covered; the previous eleven could leave one paid metric. Lambda's shared request/duration and SQS's shared million-request allowances can cover small workloads. One paused mapping is below a million requests in the planning range; three live mappings can exceed it by approximately 944,000 before real messages. Eligibility and other workloads must be checked. [CloudWatch allowances](https://aws.amazon.com/cloudwatch/pricing/), [Lambda pricing](https://aws.amazon.com/lambda/pricing/), [SQS pricing](https://aws.amazon.com/sqs/pricing/)

DynamoDB's first 25 GB Standard storage tier may cover these small tables; **provisioned-capacity free units must not be applied to on-demand requests**. PITR remains separately billable. Shortening the PITR recovery window does not lower its storage-based charge, so that supposed saving was rejected. [DynamoDB pricing](https://aws.amazon.com/dynamodb/pricing/), [PITR billing behavior](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/PointInTimeRecovery_Howitworks.html)

With otherwise unused applicable allowances, paused monthly service charges can approach **$0.40 plus tiny S3 storage**, before credits. Live charges still include SES, the secret, DynamoDB/PITR, possible excess SQS requests and uncovered usage. There is no verified account-specific net estimate; do not subtract historic API/S3/SES promotions without confirming eligibility and expiry.

Credits apply **after** eligible service allowances and expire or run out; they are not lower service prices. The Free Plan can end at six months or credit exhaustion. Account closure can break unsubscribe availability despite retained resources. Before accepting subscribers, approve durable service/payment continuity privately. No paid-plan upgrade is authorized here. These local changes add no paid-plan dependency, but owner preflight must confirm this account allows every reviewed feature (including PITR, alarms, Scheduler and artifact storage) under its current plan; no managed deployment was attempted to establish eligibility. Stop at any upgrade prompt. [Free Plan lifecycle](https://aws.amazon.com/free/free-tier-faqs/), [Secrets Manager pricing](https://aws.amazon.com/secrets-manager/pricing/)

Costs that can persist with zero subscribers/emails: the existing secret; alarm metric-hours; active feedback queue polling; retained ledger/GSI/PITR/log/artifact storage after prior use; optional SES minimums/add-ons or KMS keys if already enabled. Disabled schedule and planner/worker mappings do not poll/run. Log groups/function/queue counts alone do not create fixed monthly fees.

SNS to SQS payload data transfer can be charged even within one region; small feedback payloads fit within the live-case headroom, but must not be assumed intrinsically free. [SNS data transfer](https://aws.amazon.com/sns/pricing/)

Hidden-cost checks for eventual approved preflight: S3 versions retained for rollback, retries/DLQs, noisy clients against the management API, Logs Insights scans, account-wide alarm noise, cross-region copies/transfers, paid support, KMS, secret replicas, SES plan minimums/add-ons and unrelated resources. No automatic budget/alarm subscription or paid cost-management feature was provisioned. Use existing free Billing views and owner-approved cost controls; inspect costs after a measured disabled period before any activation.

## Savings deliberately rejected

Do not save fractions of a dollar by disabling feedback/contact synchronization, deleting suppression or consent evidence, shortening queue retention, disabling PITR, reducing replay history, removing the SQS caps or send lease, removing final SES opt-out checks, disabling all diagnostics/alarms, or caching signing keys without revocation analysis. No paid polling mode, provisioned concurrency, new CMK, infrastructure rewrite, function consolidation, table-class/index migration or paid SES feature is justified. At 25 MB/month, shorter retention saves only about **$0.0004/month** in archival storage before allowances; its main benefit is a reasonable diagnostic privacy/retention bound, not material budget relief.

## Verification, artifacts and remaining gates

Validation: **114/114 backend tests passed**, including nine new monitoring/cost regressions; **248/248 repository cases passed across final group results**. The first run had 247 passes and one unrelated publisher dry-run timeout at its existing 30-second limit; an unchanged targeted safety-group retry passed all ten. Initial failure evidence is preserved. A separate **114/114** backend run passed against the fresh SAM-built production dependencies. Focused ESLint and service syntax/safety checks passed. Website TypeScript/production build were not rerun: all 190 snapshotted website source files match the previously validated baseline and no Next.js code changed.

Source `sam validate --lint`, fresh `sam build` using `NodejsNpmBuilder:NpmCI`, and production `npm ls` passed under the AWS-denying guard. Local SAM translation verified 38/42 resources and all **32** combinations of the five infrastructure flags; default send grants are absent, Scheduler and planner/worker mappings disabled, SES sending false. Final release-template lint and the synthetic package smoke check also passed; detailed results are in the companion inventory. Current prepared output is `E:\cv-nl-cost-20261024-192828`; earlier outputs are preserved evidence. **Deploy the new runtime and template together**: the new alarms expect the new `SafetyFailure` metric contract.

Prepared artifacts (local only):

- Shared `packages-release/newsletter-runtime.zip`: **4,188,886 bytes**, 4,123 files; SHA-256 `3a407cc8b2cd8cc584baa8bf52d9cf44e98ab2a49d07ab22f90e04ff3011e92b`.
- `release-template.json` references that single ZIP for all five functions; `build1/template.yaml` and built function directories are preserved.
- `source-release` contains only nine allowlisted build inputs. Only six first-party runtime modules plus `package.json` enter the ZIP, with unchanged locked production dependencies from the prior verified archive; a fresh SAM dependency installation and built-dependency tests independently passed. Every ZIP entry was hashed/read back. No first-party tests, migration tooling/data, reports, `.env`, private address, credentials, backups or native binaries are bundled.
- Evidence/manifests include per-entry hashes, local translation, condition matrix and denied-network/AWS-call counters. The runtime smoke uses Windows Node22 and synthetic data; it is not managed Linux/ARM64 validation.

Changed existing files: `services/newsletter/template.json`, `src/aws.mjs`, `src/service.mjs`, service `README.md`, owner deployment runbook, and the quota report's supersession notice. Added: service `test/cost.test.mjs`, this report and its inventory. No source files were deleted in this task; ten obsolete alarm definitions were removed/replaced locally. Existing legacy-code removals belong to the prior approved rebuild.

Preservation evidence: `.verification/newsletter-minimum-cost-20261024-192828Z`, including a readback-hashed 268-file pre-change ZIP and prior readiness evidence. Existing branch/HEAD, backups and all unrelated uncommitted work are preserved. No secrets or private addresses were read/copied; no cloud resources were contacted by tests/builds.

Remaining activation blockers are unchanged: approved notification destination/incident ownership; synthetic managed-service validation; reliable separate **SES non-send API pacing** (not solved by the SendEmail lease or 14/second send quota); shared quota-ten capacity/opt-out availability under contention; historical unsubscribe/suppression recovery and legacy sender containment; private lawful address/consent/identity/privacy approvals; separately approved complete RSS/website routing release; and credit/payment continuity. Local tests cannot prove production IAM, actual costs, runtime availability or notification delivery.

**Decision: local cost preparation only. Keep provisioning deferred for minimum spend; live activation remains NO-GO.** If the owner later chooses disabled provisioning, the exact first AWS action remains separately approved metadata-only `DescribeSecret` to select the existing ARN, followed by the runbook's staged approvals. Do not retrieve the secret value. No AWS action was executed during this task.
