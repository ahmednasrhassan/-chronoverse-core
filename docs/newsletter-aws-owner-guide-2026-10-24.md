# Current local runtime: independent AWS Newsletter

Read the [25 October independence guide](newsletter-aws-independence-2026-10-25.md) before using this historical setup document. Website RSS and Vercel forwarding are no longer mandatory runtime dependencies. New S3 publication approval/cutover and independent public-origin decisions remain unconfigured; source changes require new reviewed artifacts and a separately approved change set. Preserve the original key/suppression/recovery requirements below. No deployment or activation occurred.

# AWS newsletter owner setup, migration and activation

24 October 2026 · local preparation only · **NO-GO for production activation**

Nothing below has been executed against production. Provisioning, configuration changes, subscriber export/import, website deployment and any test email require separate explicit approval. Existing resources, secrets, articles and subscriber records remain untouched.

## Decisions needed first

1. Confirm AWS account and region. **`eu-west-1` (Ireland) is a proposed planning region**, not a claim about existing resources, data residency or legal suitability. Prefer an approved region already holding the intended SES identity; SES identities, quotas, contact lists and suppression are regional. Use that same region consistently throughout this stack.
2. Confirm legal operator, controlled sender/support mailboxes, audience jurisdictions and consent wording. The brand is not being represented as a US LLC.
3. Provide a lawful **public** business mailing address approved for email publication. A suitable authorized business address, PO box or commercial mailbox may be considered where applicable; do not publish an unapproved residential address or reuse the discredited legacy address. The address goes into outgoing email only after approval. Review applicable marketing/privacy rules and provider requirements. [FTC commercial-email guidance](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)
4. Confirm budget, expected audience, accountable incident handler, retention, processing regions/provider agreements, privacy notice and who will handle opt-out recovery. Current website privacy copy describes preparation, not an already operating AWS migration.

## Console checklist — execute only after approval

Use an owner account with MFA and short-lived administrative/assumed-role credentials. Do not use the root account or copy legacy access keys into Lambda/Vercel. The stack creates new isolated resources; it does not manage or delete existing production resources.

### 1. SES identity, region and access

1. Select the approved region in AWS Console. Open **Amazon SES → Configuration → Verified identities**.
2. Inspect the existing domain identity for `chronoversecapital.com`. If absent, choose **Create identity → Domain**, enter the controlled domain, enable Easy DKIM and review the generated DNS records. DNS changes need their own approval. Do not request an email verification message as an unapproved test.
3. Publish only the DNS records SES provides through the authorized DNS owner. Wait for identity and DKIM status to become verified. Review custom MAIL FROM, SPF and DMARC alignment with the DNS owner; do not replace unrelated mail records.
4. Record the verified domain identity ARN without copying any secret. It must match the selected region/account and the intended sender.
5. Open **SES → Account dashboard**. Inspect sandbox/production status, daily quota and maximum send rate. Request production access only after approval, supplying accurate weekly-newsletter, double-opt-in, unsubscribe and bounce-handling details. Do not claim approval has already been granted. Plan for at least 3 messages/second of account quota or reduce confirmation concurrency; digest pacing is approximately one/second, and other account senders share quotas. [SES identity setup](https://docs.aws.amazon.com/ses/latest/dg/creating-identities.html), [production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)

### 2. Dedicated secret

1. Open **Secrets Manager → Store a new secret → Other type of secret**, only after key-provisioning approval.
2. The application expects JSON properties **`capabilityKey`** and **`websiteKey`**, each a dedicated cryptographically random secret of at least 32 bytes, held in the owner's secret manager. Do not use fixture strings, Sanity credentials, `SANITY_WEBHOOK_SECRET` or a guessed historical value. This guide does not generate or display keys.
3. Add **`legacyV1Key`** only if the exact original unsubscribe key is recovered with provenance. Otherwise omit it; new key creation cannot repair old encrypted links. Do not rotate existing production secrets.
4. Prefer the AWS-managed `aws/secretsmanager` encryption key for this template. A customer-managed KMS key requires an additional reviewed, narrowly scoped `kms:Decrypt` grant for API/worker roles.
5. Keep automatic rotation disabled until a reviewed multi-key compatibility design exists. Record the secret ARN/version provenance only. Never paste values into chat, reports, screenshots or command history.

### 3. Reproducible infrastructure and code packaging

The authoritative definition is [services/newsletter/template.json](../services/newsletter/template.json). Do not manually create duplicate resources with the same names. SAM packages the Node.js modules and pinned dependencies, then CloudFormation creates the stack.

After separate AWS access/provisioning approval, use a reviewed workstation with Node 22+, AWS SAM CLI and a short-lived owner session. An approved artifact S3 bucket is also needed; creating one is a separate paid-resource action. Commands below are instructions, not actions performed here:

```powershell
npm ci --prefix services/newsletter --ignore-scripts
sam validate --lint --template-file services/newsletter/template.json
sam build --template-file services/newsletter/template.json
sam package --template-file .aws-sam/build/template.yaml --s3-bucket OWNER_APPROVED_ARTIFACT_BUCKET --output-template-file .newsletter-private/packaged.yaml --region OWNER_APPROVED_REGION
```

Create `.newsletter-private` locally before packaging; keep it outside version control and restrict access. SAM/CloudFormation packaging does not authorize deployment.

1. Open **CloudFormation → Create stack → With new resources → Upload a template file** and select the packaged template.
2. Choose an isolated stack name, e.g. `chronoverse-newsletter-v2`. Enter `SecretsArn`, `SenderEmail`, `IdentityArn`, and the owner-approved `PostalAddress`. The address parameter is masked in stack views, but it will be public in eventual email.
3. Keep **`DeliveryEnabled`, `RegistrationEnabled`, `ConfirmationEnabled`, `LegacyDispatchRetired`, `ComplianceApproved` all `false`**. Supply an existing operational `AlarmTopicArn` if approved; otherwise alarms exist without notification subscribers. No alert subscription email is created by the template.
4. Review the change set and IAM capabilities. Confirm it creates only the replacement resources and does not replace existing infrastructure. Execution of the change set requires explicit provisioning approval.
5. Once approved and created, save non-secret **Outputs**: API URL, ledger name, contact-list name, configuration-set name, feedback-topic ARN and failure-queue URL. Keep all send switches off.

### 4. Verify SES contact management and event destination

1. **SES → Contact lists:** locate the stack's `-weekly` list; verify topic `weekly-research` defaults to **OPT_OUT**. Do not import contacts through the SES bulk-import wizard; it would bypass consent reconciliation.
2. **SES → Configuration sets → stack's `-events`:** verify sending is disabled while all flags are false. Verify suppression reasons include bounce and complaint.
3. Open **Event destinations → newsletter-safety**. Verify enabled SNS destination and events: bounce, complaint, delivery, reject, rendering failure, delivery delay and subscription. Open/click tracking is intentionally absent.
4. **SNS → Topics:** verify the exact stack topic and its SQS subscription. It is not an HTTP subscriber that needs a confirmation email. Verify its policy permits only SES from this account and configuration set to publish.
5. **SQS → FeedbackQueue → Access policy:** verify only that SNS topic can publish through the service policy. Queues use managed encryption and 14-day retention. Do not click test/publish/send-message controls against real audiences. [SES list management](https://docs.aws.amazon.com/ses/latest/dg/sending-email-list-management.html), [subscription behavior](https://docs.aws.amazon.com/ses/latest/dg/sending-email-subscription-management.html)

### 5. Verify DynamoDB, Lambdas, IAM and scheduler

1. **DynamoDB → Tables → ledger:** confirm on-demand billing, partition key `pk`, `Audience` GSI (`audienceKey`, `pk`), encryption, point-in-time recovery and deletion protection. The stream uses keys only. TTL is `expiresAt`; application code sets it only on temporary rate-limit records. Do not browse subscriber items during configuration verification.
2. **Lambda → Functions:** verify the five stack functions: API, planner, worker, feedback and contacts. Runtime is Node 22 ARM64; memory 256 MB; timeout 60 seconds. Worker reserved concurrency is one. Do not invoke send functions against production.
3. Inspect triggers: planner/digest SQS mappings are disabled by default; feedback and filtered DynamoDB-stream mappings remain enabled so opt-outs can be persisted/synchronized independently of sending. Failed messages/stream batches go to the failure queue after bounded retries.
4. **IAM → Roles:** verify each Lambda has its own execution role. Planner has no SES send permission; feedback/contact roles cannot send; API and worker get `ses:SendEmail` only through the relevant approved template condition, restricted to the identity/configuration set and sender address. Contact writes are restricted to the new list. Database permissions are restricted to the new table/index; no `DeleteItem`, contact deletion, suppression deletion, general administrator or Sanity permission is granted.
5. The only SES wildcard resource is the required account-level suppression **read**, region-restricted; stream listing also requires a wildcard. Runtime permissions are not proven effective until isolated managed-service tests succeed. [SES IAM reference](https://docs.aws.amazon.com/service-authorization/latest/reference/list_sesv2.html)
6. **EventBridge → Scheduler → Schedules:** verify `stack-weekly` is **DISABLED**, timezone UTC, expression `cron(0 9 ? * MON *)`, target planner SQS, one-hour retry age, three scheduler attempts and the failure queue. This is 09:00 UTC; local Cairo time follows daylight-saving changes.
7. **CloudWatch → Alarms/Logs:** verify error, queue-failure, held, provider/API-failure and dead-letter alarms. Subscribe an operational destination only with separate approval. Keep request bodies, tokens, addresses, bridge headers and query strings out of logs. API access logging is deliberately not enabled in this template. [Scheduler targets](https://docs.aws.amazon.com/scheduler/latest/UserGuide/managing-targets.html)

### 6. Website configuration — remain paused

SAM supplies these Lambda environment names from stack resources/parameters; do not copy workstation environment files into Lambda:

| Names | Purpose |
| --- | --- |
| `TABLE_NAME`, `TABLE_STREAM_ARN` | Dedicated durable ledger and keys-only stream |
| `SECRETS_ARN` | Dedicated secret reference; values are fetched with execution-role permissions |
| `SENDER_EMAIL`, `POSTAL_ADDRESS` | Approved sender and public mailing address |
| `CONTACT_LIST`, `CONFIGURATION_SET` | Dedicated SES list and safety-event configuration |
| `FEEDBACK_TOPIC_ARN`, `FEEDBACK_QUEUE_ARN` | Authenticated provider-feedback path |
| `PLAN_QUEUE_URL`, `PLAN_QUEUE_ARN`, `DIGEST_QUEUE_URL`, `DIGEST_QUEUE_ARN` | Queued planning and sending |
| `DELIVERY_ENABLED`, `REGISTRATION_ENABLED`, `CONFIRMATION_ENABLED`, `LEGACY_DISPATCH_RETIRED`, `COMPLIANCE_APPROVED` | Exact string switches; all default to `false` |
| `AWS_REGION` | Provided automatically by Lambda; use its execution role, not access-key variables |


Only after approved stack verification, add these **server-only** Vercel variables in the intended deployment environment:

| Variable | Purpose |
| --- | --- |
| `NEWSLETTER_AWS_API_URL` | Exact API Gateway Output URL; HTTPS regional execute-api host, no stage path/query |
| `NEWSLETTER_AWS_BRIDGE_KEY` | Dedicated `websiteKey` secret, delivered privately by the owner |

No `NEXT_PUBLIC_` secret, AWS access key, Sanity newsletter writer or old signing variable is needed in the website. Existing `SANITY_API_WRITE_TOKEN` and `SANITY_WEBHOOK_SECRET` remain for unrelated CMS operations. The original unsubscribe key, if recovered, belongs only in the AWS secret.

Both website signup views remain paused by `NEWSLETTER_SIGNUPS_PAUSED = true`; environment variables cannot reopen them. Reopening needs a separately reviewed code release. Auth, password recovery, transactional authentication email and contact mail flows remain outside this newsletter stack.

## Migration and historical-link recovery

1. **Before cutover**, inventory current and immutable Vercel URLs/aliases, all old `/api/amazon` variants, Cron/manual/external schedulers, Sanity webhook destinations and any other hosting copies. The old publication webhook is newsletter-only; retain `/api/revalidate` and Blogger-image/CMS workflows.
2. With separate approval, stop **newsletter-specific** legacy dispatch at its source/permissions/routing. Do not globally disable SES, revoke shared keys or break transactional mail. Local tombstones cannot stop an old deployment. Preserve provider metadata, old webhook retries, feedback queues, consent and suppression evidence.
3. Obtain an authorized encrypted export of legacy subscribers, duplicate IDs, inactive/manual opt-outs, Sanity suppression hashes/reasons, relevant historical audience lists and consent/dispatch evidence. No export was performed here. Never store real records in Git or chat. Keep the source export immutable and record counts/checksums privately.

   Removing the local subscriber schema and Studio pane does not delete or secure existing Sanity documents. Review legacy dataset/token permissions through metadata under separate approval; do not make records public or delete them to complete migration.
4. Normalize privately to the import schema documented in the service README. Dry-run `scripts/import.mjs` with `--input=PRIVATE_FILE --batch=APPROVED_BATCH`; it reports counts only and makes no AWS call. Reconcile duplicates, hash-only suppressions and ambiguous consent. Inactive legacy records are conservatively suppressed; all other imports are **HOLD**, not sendable.
5. Only after production-data approval, use the dedicated short-lived migration role and explicit `--apply-approved --table-arn=EXACT_ARN --region=APPROVED_REGION --input-sha256=PRIVATE_INPUT_HASH`. Required actions are `DescribeTable`, `PutItem`, `UpdateItem` on that ledger; no SES permission or delete permission. Reuse the same batch/input for a restart. Changed batch content fails before record changes. Original source references and consent evidence are preserved; incoming data cannot reactivate a suppressed record.
6. Reconcile counts and durable suppression before declaring migration complete. No automatic bulk reactivation/reconfirmation campaign is provided. Legacy HOLD records need a separately approved, verifiable re-enrolment process; a missing consent trail is not fresh consent.
7. Git history places all three missing old variables and the v1 token system in `dea9254`, 24 October 00:39 Cairo time. Earlier signup used `SANITY_API_WRITE_TOKEN` / `SANITY_API_TOKEN`, and old sending used SES without the new enable flag. No pre-release signed unsubscribe implementation/key was found. Inspected local/backup environment inventories contain no unsubscribe key. The likely issue was a newly introduced, unprovisioned prerequisite; this is not evidence that historical v1 mail actually existed.
8. Review historical sender templates or owner-controlled test-message metadata to establish link formats without opening subscriber records or invoking links. If an original v1 key exists, retain it in `legacyV1Key`; the old `/api/newsletter/unsubscribe?token=v1...` URL remains compatible once AWS is configured. If it cannot be recovered, encrypted tokens cannot safely identify their recipient. Keep support recovery available, do not substitute a new key or trust unsigned email addresses, and record verified manual opt-outs durably under separate authorization. No bulk email announcing a migration is authorized.
9. Inventory old SNS subscriptions and outstanding feedback before replacing the site. The old feedback HTTP route deliberately returns 503; provider retries have finite retention. Do not deploy that change until old feedback is reconciled/re-routed under approval and manual recovery is ready. A local 503 does not itself save an opt-out.

## Activation gates

- [ ] Owner approves operator, public address, sender, consent/privacy/retention and support process.
- [ ] Every known legacy sender is contained; unresolved old versions remain a NO-GO.
- [ ] Original-link compatibility or staffed recovery is established; old feedback is reconciled.
- [ ] Dedicated resources, secrets, permissions, DKIM, production access, quota and alarm routing verified.
- [ ] Isolated **nonproduction** managed-service tests with synthetic data verify transactions, conditional claims, streams, IAM-denied operations and SNS routing. SDK mocks cannot establish these facts. No production subscribers or shared credentials.
- [ ] A separately approved, tightly scoped owner-inbox send verifies received headers, SES unsubscribe behavior, DKIM, footer and confirmation. SES simulator messages also count as real sends and remain prohibited until approved.
- [ ] Migration reviewed; all legacy HOLD records excluded; suppressions checked before activation.
- [ ] With approval, create/update one DynamoDB `CONTROL` item with `legacyRetired`, `complianceApproved`, `migrationComplete`, `deliveryEnabled`, `registrationEnabled`, `confirmationEnabled` all boolean values reflecting actual completed gates. Confirmation activation requires `registrationEnabled`, `confirmationEnabled`, `legacyRetired`, `complianceApproved`, `migrationComplete` all boolean true; missing, false or malformed approvals deny it. For a zero-audience launch, `migrationComplete` attests reviewed suppression/recovery readiness, not an automatic import. Keep all enable fields false until final activation. The Stockholm fresh-stack plan does not create this item during provisioning.
- [ ] Only after final approval, update infrastructure flags and controls for the intended stage. Confirmation can be enabled independently while digest remains off; actual signup reopening still requires its separate code release. Enable digest/Scheduler last, after queued stale jobs and held outcomes are reviewed. Never redrive held messages by deleting claims.

For an approved initial disabled setup, DynamoDB Console **Explore table items → Create item → DynamoDB JSON** can use this configuration-only item. It is not subscriber data, and has not been created here:

```json
{
  "pk": { "S": "CONTROL" },
  "legacyRetired": { "BOOL": false },
  "complianceApproved": { "BOOL": false },
  "migrationComplete": { "BOOL": false },
  "deliveryEnabled": { "BOOL": false },
  "registrationEnabled": { "BOOL": false },
  "confirmationEnabled": { "BOOL": false }
}
```

## Public RSS discovery checks before digest activation

The authoritative Stockholm region and disabled provisioning runbook are in [the deployment readiness report](newsletter-aws-stockholm-deployment-readiness-2026-10-24.md). The confirmation defect noted there was subsequently resolved in [the confirmation safety report](newsletter-confirmation-safety-fix-2026-10-24.md). This guide's earlier proposed Ireland region does not override the owner's confirmed `eu-north-1` choice.

- [ ] After a separately approved website deployment, read `https://chronoversecapital.com/rss.xml`: verify HTTP 200, RSS 2.0, stable `urn:chronoverse:article:` GUIDs, original publication dates, canonical root article links and the complete still-public archive. `/feed.xml` remains an alias. Confirm success caching expires within five minutes and failures do not return a fabricated empty feed.
- [ ] Deploy only the reviewed AWS discovery code and article-scoped IAM change through the approved Stockholm change-set process, with all five switches false, no scheduler execution and no automatic legacy imports. This work adds no resource or index. Registration stays code-paused.
- [ ] Under separate isolated-test approval, verify effective BatchGet/transaction IAM, the public feed fetch and persistent article/campaign claims with synthetic records and SES sending still denied. Do not use actual subscribers or clear any retained production idempotency records to test retries.
- [ ] Review the initial period: the first approved digest planner invocation records the prior Monday 09:00 UTC as its permanent starting boundary, including if the feed fetch fails. Older archive articles are excluded. Subsequent weeks recover missed publications and overflow, oldest eligible first, at most ten per issue. This is automatic discovery, without Vercel Cron, newsletter webhooks, homepage scraping or manual article selection.
- [ ] Preserve public GUIDs, the canonical domain, `DISCOVERY`, `ARTICLE#`, `ARTICLE_URL#`, campaigns and recipient claims during hosting migrations/rollback. Do not revert to the eight-article planner or a truncated feed once the replacement operates. Monitor the full-feed 2 MB/5,000-item/ten-second limits; an exceeded limit stops new issue creation and requires a reviewed capacity change.

See [RSS discovery evidence and limitations](newsletter-rss-discovery-2026-10-24.md). These are future owner checks; no deployment, live AWS check, scheduler invocation or email has been performed.

## Rollback and incidents

For a registration/confirmation pause, an approved operator must first set durable `CONTROL.registrationEnabled` and/or `CONTROL.confirmationEnabled` to boolean `false`, then update the corresponding infrastructure flags. Confirmation transactions check those durable approvals atomically, including in an older in-flight Lambda invocation. A transaction serialized before the pause may already have confirmed; one serialized after it cannot. Updating Lambda environment configuration alone cannot atomically revoke every already-running invocation. Keep unsubscribe and safety feedback available; do not rotate capability keys to pause enrollment. No control record or production setting was changed by this local fix.

First turn off replacement newsletter send switches/control under approved incident authority and disable its scheduler/mappings. Preserve unsubscribe API, feedback, contacts sync, ledger, contact list and keys. Retain the public management URL and website proxy; do not delete the stack as rollback. Already accepted email cannot be recalled.

Roll back website presentation only to a reviewed build with retired dispatch stubs and working management routing. Do not promote an old sender-enabled immutable deployment. Never restore the pre-migration Sanity audience over AWS suppressions. If returning to another architecture is proposed, export and reconcile every suppression/consent event first under separate approval. Durable ledgers and unknown claims are retained, not reset to make retries appear successful.

Local source recovery backup: `E:\chronoverse-backups\chronoverse-newsletter-rebuild-20261024-090025Z`. Extract its ZIP into a **new empty directory**, verify its manifest and Git status, and review changes before any use. It preserves the uncommitted P0 implementation for recovery; it is not a safe production rollback target by itself. It contains private local configuration: do not upload it.

## Monthly planning costs

Illustrative USD, checked 24 October 2026; not an AWS quote. Assume 4.345 weekly digests/month, 10% new confirmations/month, one recipient/message, ~32 KB mail, ARM64 256 MB workers, ~1.5 seconds per digest and light feedback/API traffic. No paid resources were created. Regional rates, existing account plan, free-tier sharing, abuse, retries and retained history can change costs.

AWS currently shows SES **Essentials $0.16/1,000** at this volume; available à-la-carte outbound pricing is **$0.10/1,000**. Do not assume the old rate applies to a newly activated account/region. [SES pricing](https://aws.amazon.com/ses/pricing/)

| Audience | Digest + confirmation messages/month | SES Essentials / à-la-carte | Other AWS budget | Estimated total using Essentials |
| --- | ---: | ---: | ---: | ---: |
| Low: 1,000 | 4,445 | $0.71 / $0.44 | $4–8 | **$5–9/month** |
| Medium: 10,000 | 44,450 | $7.11 / $4.45 | $5–12 | **$12–20/month** |
| Higher: 100,000 | 444,500 | $71.12 / $44.45 | $10–25 | **$82–97/month** |

Other-AWS ranges budget for Lambda requests/compute, DynamoDB reads/writes/GSI/PITR and retained ledger growth, SNS/SQS, API Gateway, Secrets Manager, small logs, custom metrics and alarms. They exclude tax, domain/mailbox/postal-address fees, paid deliverability plans, dedicated IPs, NAT gateways, WAF, large imports and prolonged incident retries. No NAT gateway or dedicated IP is defined. Estimated mail data is roughly $0.02/$0.17/$1.71 at $0.12/GB for 32 KB messages, included in the ranges.

Useful calculator inputs: approximately six strong reads and two claim/result writes per digest, plus feedback/audit writes; transactional consent writes cost more than standard writes. Lambda compute is roughly `digests × 0.25 GB × 1.5 seconds`, plus planner/API/feedback work. One secret is about $0.40/month plus API calls; worker secret reads are intentionally uncached. Do not assume shared free allowances remain available. Recalculate for the approved region and actual retention before spending approval. [Lambda](https://aws.amazon.com/lambda/pricing/), [DynamoDB](https://aws.amazon.com/dynamodb/pricing/), [Secrets Manager](https://aws.amazon.com/secrets-manager/pricing/), [EventBridge](https://aws.amazon.com/eventbridge/pricing/), [SQS](https://aws.amazon.com/sqs/pricing/), [CloudWatch](https://aws.amazon.com/cloudwatch/pricing/)
