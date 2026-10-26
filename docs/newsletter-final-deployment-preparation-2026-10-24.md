# Final AWS newsletter deployment preparation

**Historical preparation snapshot.** The owner subsequently confirmed account concurrency ten. The [quota compatibility report](newsletter-lambda-quota-compatibility-2026-10-24.md) and updated [runbook](newsletter-owner-deployment-runbook-2026-10-24.md) supersede the reservation requirement and artifacts below. Do not upload the old `E:\cv-nl-20261024-154636` release ZIP/template; they are preserved as evidence only.

24 October 2026. **PREPARED for local artifact/owner review. BLOCKED for AWS provisioning until preflight and explicit approval; BLOCKED for live activation until managed-service, historical safety and compliance gates pass.** No AWS account API, secret retrieval, upload, resource change, subscriber access, email, commit, push or deployment occurred.

Use the [owner runbook](newsletter-owner-deployment-runbook-2026-10-24.md) and [complete file/resource/IAM inventory](newsletter-final-deployment-inventory-2026-10-24.json). This report supersedes earlier missing-SAM-tool and missing-secret preparation assumptions. Historical reports remain preserved.

## Baseline and evidence

Branch `master`; HEAD remains `dea9254fb82b90076671d58e884dd58ba61eb1eb`. All existing uncommitted work and backups were retained. Before edits, 262 existing files were captured and every ZIP entry verified by SHA-256. Evidence/backup directory: `.verification/newsletter-final-preparation-20261024-154636Z/`. Prior readiness-test logs were archived before rerunning their shared runner.

The owner, not an AWS API call by this audit, confirmed: Stockholm; verified `chronoversecapital.com`/DKIM; repaired DMARC; SES production access and sending enabled; 50,000/day and 14/second; BOUNCE/COMPLAINT account suppression; no contact lists or active CloudFormation stacks; existing `chronoverse/newsletter-v2`; controlled `info@chronoversecapital.com`; privately selected mailing address; credit-backed Free Plan. Actual secret values, full ARN, encryption-key metadata, remaining credits/expiry and Lambda quotas were not retrieved.

Public AWS documentation and anonymous regional pricing catalogs were consulted. The AWS documentation connector required reauthentication, so official public sources were used instead. No account access was attempted through that fallback.

## Essential corrections made

1. **Durable confirmation-email pause:** the completed activation fix correctly protected pending → confirmed and atomically consumed nonces. However, `assertMailAllowed(..., "confirmation")` omitted durable `confirmationEnabled` and `migrationComplete`. With runtime flags enabled, either durable field could be false and still permit a new confirmation email. A pure before/after probe verified this without sending. The mail gate now reuses `assertConfirmationAllowed`, blocking enrollment before pending/rate writes and blocking direct SES-adapter confirmation calls unless every required approval is exact. Atomic activation/nonce logic, unsubscribe, suppression and feedback remain unchanged. Eight new regression tests cover malformed approvals, direct-adapter bypass, secret-key names and build/reference invariants.
2. **Reproducible SAM installation:** all five functions now specify `Metadata.BuildProperties.UseNpmCi=true`; SAM's default builder otherwise selects `npm install`. The real build log verifies `NodejsNpmBuilder:NpmCI`. The consent-facing SES topic description now matches the approved ten-article limit.
3. **Incompatible locked SDK peer:** the old service lock selected `@aws-sdk/util-dynamodb@3.996.9`, requiring DynamoDB client `^3.1111.0`, while the approved client/lib remain `3.1095.0`. A clean install exposed peer warnings. A narrow override pins the compatible `3.996.7` utility (peer `^3.1088.0`). Only that utility resolution/location changed; other locked package entries and top-level clients remain unchanged. Fresh `npm ci` and `npm ls --all` pass without the warning. Existing repository dependency installations were preserved; final backend tests used the actual newly built dependency tree.

No website/Next.js source, scientific article, RSS discovery logic, legacy retirement route, Vercel configuration or production configuration was changed.

## Secret, identity and disabled-mode conclusions

- Supported secret properties are **`capabilityKey`**, **`websiteKey`**, optional **`legacyV1Key`** only for a proven original key. No old Sanity variable or alternate key name is a fallback. A mocked Secrets Manager transport verified the two-key and optional-original-key contract. Actual contents remain owner-confirmed and uninspected; no original legacy key is assumed recovered. Unsupported extra JSON fields are not used as credentials; the reader is not a strict extra-field schema validator.
- `SecretsArn` references the existing dedicated secret, not a new `AWS::SecretsManager::Secret`. Only API/worker execution roles receive scoped secret-read permission. No dynamic reference resolves values into the template, outputs or deployment package. If the existing secret uses a customer-managed KMS key, a reviewed decrypt/key-policy grant is still required; the intended AWS-managed-key setup needs no new KMS resource.
- `IdentityArn` is a reference to the existing verified SES domain identity. There is no email-identity/DNS resource, identity-default update or account-wide sending/suppression change. A new isolated configuration set is used per newsletter message. Transactional/authentication/contact mail source remains preserved.
- All five switches default to **false**. Every one of 32 switch combinations was checked. Defaults yield **no IAM `ses:SendEmail` grant**, configuration-set sending false, Scheduler disabled and planner/worker mappings disabled. Feedback/contacts safety mappings remain enabled. Runtime and strongly read durable `CONTROL` checks add independent barriers; no control item is seeded. Missing/false/malformed confirmation approvals deny both invitation and activation.
- Website signup remains code-paused; `vercel.json` retains `crons: []`. Live Vercel settings were not accessed or changed. Nothing here proves old immutable sender deployments are disabled.
- Fresh provisioning creates an empty ledger/list with `OPT_OUT` defaults, no subscriber import, no seed/custom resource and no automatic migration. The deployed package excludes migration code/tools. This is a source/construction conclusion, not an observation of a live audience. Historical records/suppressions remain untouched.

## Prepared deployment artifacts

Output root: **`E:\cv-nl-20261024-154636`**, outside Git. A short path avoided Windows SAM installer path-length failures; the initial failed isolated install/logs were preserved. No system installation, global PATH change or production configuration was made.

| Artifact | Location / result |
| --- | --- |
| Reviewed deployment template | `release-template.json`; local ZIP references, no actual private parameter values |
| Shared runtime ZIP | `packages/newsletter-runtime.zip`; reused by all five Lambda functions |
| ZIP SHA-256 | `7db7e373c9090ed880caf11ad4f35f76a3a43715bb0379447a3549ae6b8487d5` |
| ZIP contents | 4,123 files; **4,187,495 compressed bytes / 12,435,296 uncompressed bytes** |
| Runtime modules | `aws.mjs`, `domain.mjs`, `handlers.mjs`, `rss.mjs`, `service.mjs`, `discovery.mjs` |
| SAM build output | `build1/`, five identical function trees plus `template.yaml` |
| Allowlisted source snapshot | `source-release/`, nine source inputs and freshly installed production dependencies |
| Manifest | `artifact-manifest.json`; detailed per-file hashes in the evidence directory |
| Tooling | `sam/` contains SAM CLI 1.170.0; Node 22.23.4 was checksum-verified and retained under the evidence directory's `tools/node22/` |

Every ZIP entry was read back and hashed. All five SAM trees matched; one ZIP reduces duplicate uploads/storage. The archive excludes first-party tests, scripts, migration helpers, reports, `.env`, `.npmrc`, subscriber data, credentials, private address inputs, backups, repository metadata, install lock/cache metadata and Windows `.bin` launchers. Third-party published runtime code, types, licenses and package metadata remain intact. No native binaries were found; the pure-JavaScript package was smoke-tested with Node 22 on Windows, **not** executed in Linux/ARM64 or AWS. Package size is below Lambda ZIP/uncompressed limits.

The release template removes inherited local directory code references and explicitly points all functions at the inspected ZIP. It was separately SAM-linted. No S3 bucket or packaged/cloud template has been created. `sam package` remains an approved future upload action, not part of this local preparation.

## Resources and IAM

**45 authored resources; 49 in the local SAM translation.** Translation used a synthetic S3 reference only in ignored inventory evidence because CloudFormation requires remote code references; it is not a deployable artifact. The actual managed change set remains authoritative.

| Resources | Count / important properties |
| --- | --- |
| Lambda functions | 5: API, planner, worker, feedback, contact sync; Node 22 / ARM64 / 256 MB / 60 seconds |
| Execution roles | 6: five Lambda roles plus Scheduler role; no fixed IAM RoleName |
| DynamoDB | 1 on-demand ledger; `Audience` GSI; keys-only stream; encryption, PITR, deletion protection; durable safety/idempotency records without TTL |
| SES | 1 contact list, 1 configuration set, 1 event destination; existing domain identity/secret remain external |
| SQS | 4 encrypted queues: planner, digest, feedback, shared failure; 14-day retention |
| SNS | 1 topic, 1 topic policy, 1 SQS subscription; plus 1 SQS queue policy; no email subscription |
| API Gateway | 1 HTTP API; SAM adds 1 default stage and 3 Lambda invoke permissions |
| Event source mappings | 4: three SQS, one filtered subscriber stream |
| Scheduler | 1 disabled Monday 09:00 UTC schedule; not Vercel Cron |
| CloudWatch | 5 retained log groups, 30 days; 11 alarms; no default alarm destination |
| External prerequisites | Existing secret/SES identity, approved S3 artifact bucket, approved CloudFormation execution role/session; no bucket/secret/identity is created by the app template |

Runtime role review:

- API: ledger Get/Put/Update/ConditionCheck; selected secret; dedicated-list contact and regional suppression reads; confirmation-only conditional send grant.
- Planner: ledger Get/Put and audience query; article/campaign-prefix BatchGet/Update with required `LeadingKeys`; planner/digest queue operations. No secret, SES send or subscriber Update grant is added.
- Worker: ledger claims/results, selected secret, contact/suppression reads and digest consume; digest-only conditional send grant.
- Feedback: ledger safety writes and feedback consume; no secret/send permission.
- Contacts: filtered stream consumption, ledger safety operations and scoped Get/Create/Update on the new list; no send or suppression-removal capability.
- Scheduler: enqueue only to its planner/failure queues; account/default-schedule-group-scoped service trust. Queue/topic policies restrict source service/account/ARN.

Full policies, trusts, resource references, names and retention are recorded in the JSON inventory. SES account-suppression reads and DynamoDB ListStreams use documented wildcard scopes with regional constraints where applicable. Runtime roles do not acquire general administrator, contact deletion or secret rotation permissions. Managed effective permissions/SCPs/boundaries are unverified.

Deployment permissions are separate: caller needs approved S3 prefix upload/read and CloudFormation change-set/review/execute plus PassRole of the approved CloudFormation role. The CloudFormation role needs scoped provider create/read/update/tag/rollback operations for the listed resource families, IAM creation/inline-policy/PassRole for the six stack roles and artifact GetObject. It needs neither existing identity/secret mutation nor secret-value retrieval. Restrict IAM/Lambda/Scheduler/SES/log names to the stack prefix and constrain generated table/queue/topic resources through supported ARN/tag controls. Include rollback of new stateless resources; do not grant blanket deletion of historical data. No deployment-role policy was installed.

## Quotas, names, update and rollback

Proposed stack: `chronoverse-newsletter-v2`. Keep alternatives at most 55 characters to fit Lambda suffixes and SES names; check retained/manual resources as well as stacks. A competing SES contact list can block deployment even under a different name. There are no VPC/NAT, container-image/ECR, provisioned-concurrency, dedicated-IP or domain-registration resources.

The five functions reserve **2 + 2 + 1 + 2 + 2 = 9** units. AWS requires 100 unreserved units to remain: **current unreserved quota must be at least 109**, with existing workload needs respected. New accounts can have lower limits; this is an unresolved provisioning preflight, not proof that a paid upgrade is required. Reserved concurrency itself has no fixed fee. Do not remove the worker limit to make creation succeed. [Reservation rules](https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html), [new-account quota limits](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html)

Node 22 is currently supported; AWS projects deprecation on **30 April 2027**. Plan a reviewed runtime upgrade before then, without changing the approved runtime in this preparation. [AWS runtime schedule](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html)

Code/IAM updates require a reviewed change set. Ledger, queues, SES list/configuration and logs have retention policies; table deletion protection also applies. Failed creation can leave retained resources, so inventory/reconcile before retrying. Do not delete/recreate lists, reset claims or overwrite newer suppressions to resolve a name/update error. Existing identity and secret are external references and must stay outside replacement/rollback operations.

## Costs and Free Plan assessment

**No inherent paid-account-plan requirement was established for this template's core services**, which appear in AWS's supported Free Tier service list for the new signup experience. That list does not prove this particular account's feature permissions, quotas, credit eligibility or budget. Confirm these before writes and stop at upgrade prompts. [Supported service list](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html)

The Free Plan ends at six months or credit exhaustion and can close the account. Retention does not preserve a functioning unsubscribe service after closure. A separately approved continuity/plan decision is therefore a live-activation prerequisite. Do not join Organizations or enable Control Tower as a deployment shortcut; those actions can change plan/credit eligibility. [Free Plan lifecycle](https://aws.amazon.com/free/free-tier-faqs/)

Illustrative monthly USD **gross usage/credit-consumption budgets**, before tax and shared free allowances; not guaranteed bills. Assume 4.345 issues/month, 10% new confirmations/month, no attachments/paid add-ons, one recipient/message and light ordinary traffic:

| Confirmed audience | Messages/month | SES Essentials / à la carte message cost | Other services budget | Total with Essentials |
| --- | ---: | ---: | ---: | ---: |
| 0, disabled | 0 | $0 | approximately $1–4 | approximately $1–4 |
| 1,000 | 4,445 | $0.71 / $0.44 | $3–9 | $4–10 |
| 10,000 | 44,450 | $7.11 / $4.45 | $3–12 | $10–20 |
| 100,000, hypothetical | 444,500 | $71.12 / $44.45 | $8–30 | $79–102 |

SES currently lists **$0.16/1,000** on Essentials versus **$0.10/1,000** à la carte at these volumes. The actual account's SES plan/inherited VDM/add-ons were not checked; do not upgrade or enable add-ons to follow this runbook. Review inherited engagement tracking against the approved privacy/consent policy before activation. [SES pricing](https://aws.amazon.com/ses/pricing/)

Stockholm public catalog checks: DynamoDB Standard on-demand **$0.67/million WRUs, $0.1345/million RRUs**; ARM Lambda first-tier **$0.0000133334/GB-second**; standard CloudWatch alarms **$0.10/metric-month**, custom metrics **$0.30/metric-month** at the first tier. Eleven alarms gross to $1.10/month before the shared ten-alarm allowance. EMF metrics, logs, on-demand requests/index writes, PITR, artifact storage, retained history and the existing secret can consume credits. The provisioned-capacity DynamoDB allowance is not a free on-demand-request allowance. Public rates/evidence are stored locally. [DynamoDB catalog](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonDynamoDB/current/eu-north-1/index.json), [Lambda catalog](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSLambda/current/eu-north-1/index.json), [CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/)

The existing secret is already a baseline cost, not a second new secret. Reserved concurrency is not paid provisioned concurrency. Budgets must monitor gross consumption/remaining credits, not just a $0 cash bill. Traffic abuse, retries, unknown outcomes and retained storage can exceed these illustrative budgets; account throttles/alarms are not spending guarantees. No budget, alert email, subscription or paid feature was created.

**100,000 recipients is not currently operationally approved:** the 50,000/day SES quota and conservative retry/hold behavior need a separately reviewed quota/headroom or multi-day delivery design. Do not infer capacity from the cost row. Preserve capacity for unrelated transactional mail.

## Verification and remaining gates

| Check | Result |
| --- | --- |
| Full repository tests, Node 22 | **226 passed**: safety 10, auth 21, public 79, content 24, newsletter 92; no failed/skipped/deferred tests |
| Backend against actual SAM-built dependencies | **92 passed** |
| Focused lint on changed runtime/test source | Pass |
| Corrected clean dependency install/tree | Pass; 43 packages, no peer warning/problems |
| Source and release SAM lint, Stockholm | Pass |
| Real SAM build, Node 22 / ARM64 target | Pass; `NpmCI` verified; no container or AWS execution |
| Inspected ZIP / handler/marshalling smoke | Pass; five handler exports load, invalid GET rejects before secret/storage access; missing controls deny |
| Five-switch condition matrix | All **32** combinations pass; defaults deny send/scheduling |
| Source preservation | Existing atomic confirmation, RSS/backlog, suppression, unsubscribe and website work retained |
| Final local checks | Service JavaScript syntax/infrastructure invariants and `git diff --check` pass |

Website source/configuration is unchanged from the preceding verified RSS release preparation: **201 website/configuration file hashes match**. Its **115-page Next production build, TypeScript and full-site lint pass are reused**, not represented as newly rerun here. The current task built the Lambda packages, linted changed JavaScript and reran all current repository tests. All 262 backup entries were reverified; 257 original files are unchanged, five have the reviewed corrections, and none was removed. SDK transports/subscriber fixtures are synthetic; no secret values or real records were used. AWS CLI/Docker and actual managed-service execution were not used.

Files changed in this task: service `src/domain.mjs`, `package.json`, `package-lock.json`, `template.json`, `README.md`; added `test/preparation.test.mjs` and these three final report/runbook/inventory documents. No file was deleted in this task. The full JSON inventory also records all pre-existing working-tree changes/deletions relative to HEAD so they are not mistaken for new removals.

Still required: exact existing ARN/encryption metadata and caller/CloudFormation permissions; Stockholm Lambda quota/name/service availability; approved artifact bucket and uploads; actual change-set review/execution; synthetic managed tests; approved public RSS/management website release; historical suppression/unsubscribe recovery and legacy sender containment; monitoring, account continuity and lawful operator/consent/address readiness. None may be inferred from a local PASS.

**Exact next AWS action needing owner approval:** read-only `aws lambda get-account-settings --region eu-north-1 --query AccountLimit --output json --no-cli-pager`, as the first account/quota/secret-metadata preflight. The first subsequent AWS resource write would be separately approved artifact-bucket creation if no suitable bucket is selected; the first upload is the explicit `sam package` step. These are separate from change-set creation, execution and any activation approval. **Stop at local preparation.**
