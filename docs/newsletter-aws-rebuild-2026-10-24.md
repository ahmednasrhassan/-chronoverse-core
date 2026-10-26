# Newsletter AWS rebuild — local completion report

24 October 2026 · Chronoverse Capital

**Local implementation complete and ready for review. Production deployment/activation: NO-GO pending the owner gates below.** No deployment is authorized by this report.

Repository: `E:\chronoverse-app\-chronoverse-core-master` · branch `master` · HEAD unchanged at `dea9254fb82b90076671d58e884dd58ba61eb1eb`.

No production settings, subscriber records, consent/suppression history, published articles or existing secrets were changed. No real email, production unsubscribe/dispatch request, AWS provisioning, commit, push or deployment occurred. AWS packages and an isolated local CloudFormation validator were installed for development; no paid AWS resources were created. The AWS documentation connector required reauthentication; official public AWS documentation was used instead.

## Preservation and recovery

Before removal, created `E:\chronoverse-backups\chronoverse-newsletter-rebuild-20261024-090025Z`:

- ZIP preserves **1,352 files**, including `.git`, index, tracked/untracked source, the uncommitted P0 implementation, earlier reports and private local environment configuration.
- Every ZIP entry was read back and matched against SHA-256; all live source hashes still matched before removal; ZIP integrity and `git bundle verify` passed; working-tree status remained unchanged during backup.
- Independently verified Git bundle, manifest and restore instructions are included. Archive/bundle hashes were checked again after implementation and still match.
- Recover into a **new empty directory**, compare the manifest and original Git status, then review before any use. `node_modules` and `.next` are reproducible exclusions. Do not publish this private backup.

The earlier verified backup at `E:\chronoverse-backups\chronoverse-core-20261024-002555` is untouched. Previous audit/P0 reports and `.env.local` remain byte-for-byte unchanged. The root Next configuration and existing root build output were preserved; verification used a separate copy.

## Legacy retirement

Removed the Sanity audience/signup/campaign/suppression/feedback/SES-v1 implementation and its obsolete tests, plus the subscriber schema and newsletter-only Studio pane. Removing a local schema/pane neither deletes nor secures existing Sanity records. Provider-side privacy/permissions still need owner review through configuration metadata; no subscriber probes were performed.

Retained narrowly scoped compatibility behavior:

| Surface in a deployment containing this replacement | Result |
| --- | --- |
| `/api/cron/send-newsletter` GET/POST/automatic HEAD | Permanent 410; no credentials, body reads, audience client or sender |
| `/api/webhook/sanity` POST | Permanent 410; this was newsletter dispatch, not CMS revalidation |
| `/api/amazon` POST | Existing inert 410 retained |
| `/api/newsletter` POST | Code-paused 503 before address/body/storage processing |
| `/api/newsletter/unsubscribe` GET/POST | Scanner-safe form; protected POST forwards to AWS; supports v2 and the historical v1 URL shape |
| `/api/newsletter/confirm` GET/POST | Scanner-safe form and signed, purpose-bound mailbox confirmation |
| Old `/api/newsletter/feedback` POST | Truthful retryable 503 until old SNS feedback is reconciled; never acknowledges an unsaved suppression |

`vercel.json` retains the P0 empty `crons` array. Removed root `@aws-sdk/client-ses` and 23 now-unneeded installed dependency packages; no dependency upgrade or broad cleanup was performed. The replacement has an isolated package/lockfile using SES **v2**, DynamoDB, SQS and Secrets Manager SDK clients. Its package allowlist excludes tests and development scripts from normal npm packaging.

CMS publishing, `/api/revalidate`, Blogger-image/replay/security helpers, auth/passwordless recovery, transactional auth email, contact, account/admin, navigation, SEO and articles remain intact. Newsletter-specific privacy wording, consent controls and corresponding regression contracts were updated. No business identity or residential address was published.

## Replacement behavior

[Service source and architecture](../services/newsletter/README.md) · [SAM infrastructure](../services/newsletter/template.json) · [owner console/migration/activation guide](./newsletter-aws-owner-guide-2026-10-24.md)

- Explicit versioned consent creates only a pending record. A signed, expiring mailbox capability must be submitted by POST before eligibility. GET cannot confirm, unsubscribe, consume a capability or contact storage.
- DynamoDB is authoritative for consent/audit, permanent suppression, migration provenance, frozen weekly articles, recipient delivery claims and processed feedback. Dedicated SES Contact Lists mirror eligibility; topic defaults are OPT_OUT. Existing SES opt-outs and ledger suppression cannot be publicly reactivated.
- Monday 09:00 UTC Scheduler queues planning. The planner reads only `https://chronoversecapital.com/rss.xml`, rejects redirects/oversized XML/entities/offsite links, selects up to eight unique articles from the closed prior seven-day window, and queues paginated recipient jobs. Empty/unavailable feeds cannot produce campaign mail.
- Worker checks consent, SES preferences/account suppression, campaign age and global controls. It claims a recipient conditionally, paces sends, rechecks durable suppression and sends one-recipient SES v2 mail. Titles/summaries are escaped; text/HTML include canonical links, approved mailing address and unsubscribe routes. Broken unsubscribe-capability prerequisites prevent sending.
- Duplicate jobs cannot blindly resend. SES SDK makes one attempt; explicit HTTP 429 rejections can retry three times. Timeouts, missing acknowledgements and crashes remain held rather than automatically resent. `ACCEPTED` means SES acknowledgement, not inbox delivery. Already handed-off mail cannot be recalled by a later opt-out.
- SES configuration-set events pass through SNS and an authenticated private SQS path. Hard bounces, complaints and list/topic opt-outs durably suppress; transient bounces do not permanently suppress. Provider opt-in events cannot clear the ledger. Contact synchronization retries through a filtered DynamoDB stream; failures produce alarms/dead letters.
- Logging emits aggregate metrics, never raw subscriber data, capabilities, credentials or SDK exceptions. Private queues and the ledger retain operational evidence; retention and provider-log redaction still require owner approval.

All infrastructure enable switches default **false**. The SES configuration set is disabled; send IAM grants and scheduler/dispatch mappings are conditional. Runtime also requires a separate `CONTROL` ledger item with completed owner gates. Missing environment/control values fail closed. The actual SDK send adapter rechecks the gates independently. Unsubscribe/feedback remain independent of sending controls.

IAM uses per-function execution roles, scoped resource ARNs and sender constraints; no hardcoded AWS access keys, deletes, project administration or general Sanity writer fallback. Transaction authorization uses underlying DynamoDB PutItem/UpdateItem permissions. Existing legacy secrets remain untouched.

## Historical links and migration

Git history shows `NEWSLETTER_UNSUBSCRIBE_SECRET`, `SANITY_NEWSLETTER_WRITE_TOKEN` and `NEWSLETTER_SENDING_ENABLED` first appeared in `dea9254` on **24 October 2026, 00:39 Cairo time**. Older signup used `SANITY_API_WRITE_TOKEN` with `SANITY_API_TOKEN` fallback. Older sending used SES without the new enable flag; initial publication delivery used an environment audience list and later Sanity active records. This explains reported historical operation without the newly required variables.

No pre-release signed unsubscribe implementation/key was found in available Git history, local deployment/configuration documentation or safe backup/environment-name inventories. The evidence supports an unprovisioned new prerequisite; it does **not** prove a historical key was lost or that no external sender ever issued other links. `SANITY_WEBHOOK_SECRET` authenticates publishing webhooks and is not a substitute unsubscribe key. The general writer was technically used for old subscriber operations, but its current permissions/least privilege were never verified and it was not reused.

The only retained legacy cryptography is a wire-compatible v1 AES-GCM opt-out decoder. It requires the exact original key if such links exist. It can create durable AWS suppression before audience migration, which later imports cannot overwrite. Missing/unrecoverable keys get truthful unavailability and support recovery, not a guessed key, false success, plaintext-address endpoint or automatic resubscription.

Migration tooling is offline by default and reports counts only. It preserves source references/consent evidence, deduplicates normalized addresses, carries hash-only suppressions, treats known opt-outs/inactive records conservatively and imports everyone else as **HOLD**, never automatically sendable. Apply requires separate authorization, exact table/account/region, input hash and a reserved batch digest; restarts cannot reactivate suppressed records. No export/import was executed.

## File inventory

[Exact file inventory](./newsletter-aws-file-inventory-2026-10-24.json): **22 added, 19 deleted, 20 modified**, compared with the verified pre-rebuild working tree, including its uncommitted P0 files. This differs from a HEAD-only Git diff because some deleted P0 files had never been committed.

Deleted: ten old `src/lib/newsletter` helpers, eight old newsletter tests/fixtures, and `src/sanity/schemaTypes/subscriber.ts`.

Added: isolated AWS service source/tests/tooling/package lock/infrastructure/README, website AWS bridge, confirmation route, replacement website regression tests, owner guide, this report and the inventory. Modified files are explicitly listed in the inventory. The new fixtures replace tests of code intentionally retired; unrelated security/content/auth assertions remain covered.

## Verification results

| Check | Final result |
| --- | --- |
| Safety/environment/network regression group | **10 passed** |
| Auth/account boundary group | **21 passed** |
| Public UI/SEO/content presentation group | **72 passed** |
| CMS/content/website newsletter/legacy endpoint group | **24 passed** |
| AWS replacement suite, synthetic records and mocked SDK transports | **35 passed**, zero failed/skipped/cancelled |
| Aggregate relevant regression cases | **162 passed** across the final applicable runs; repeated cases are not double-counted |
| Root ESLint and final changed/backend-file lint | **Exit 0**; existing article `<img>` warning only |
| Next route generation + `tsc --noEmit` | **Exit 0**; build's TypeScript stage also passed |
| Backend JavaScript syntax/infrastructure safety checks | **Passed**; service is JavaScript, not claimed as fully TypeScript-checked |
| CloudFormation/SAM `cfn-lint` 1.58.0 | **Exit 0**, zero errors/warnings; credential-file lookup redirected to absent files and Python outbound networking blocked |
| Next 16.4.2/Turbopack production build | **Exit 0**, **116/116 pages generated**, 1,106.29 seconds |
| Compiled-server HTTP checks | **24 passed** across apex/apps/preview host headers, including GET/POST/automatic HEAD tombstones, paused signup and management failure/confirmation behavior |
| npm runtime package dry-run | Only runtime source, package metadata and README included; no tests, local environment files or development scripts |
| `git diff --check` | **Passed** |
| Source/recovery preservation | **189/189 application source files** match the build copy; no build-copy environment files; root Next config and HEAD unchanged; backup hashes still match |

Regression processes strip inherited service variables and deny Node networking/environment-file reads. Only synthetic addresses, consent records, capabilities and SDK acknowledgements were used. SDK-adapter tests inspect actual command construction while replacing SDK network transports. Tests cover opt-out races, lost acknowledgement, malformed records, original-format compatibility, forged/expired capabilities, missing gates, migration holds, provider suppression, duplicate jobs and bounded retries.

The first broad run exposed outdated newsletter wording and an incorrect source-file target in the updated revalidation assertion. Corrected both, then reran both full affected groups successfully. Their failed logs are retained. A Windows output-encoding wrapper error occurred after one backend run had already exited 0; its log and a subsequent final successful run establish the 35-test result.

Build/typecheck used `.verification/newsletter-rebuild-20261024-092640Z/workspace` with no `.env`/Vercel state and shared installed dependencies through junctions. Only the copy's build worker count was limited to one; root configuration was not changed. The nested-copy multiple-lockfile warning concerns verification layout. The compiled test server bound only to loopback, denied outbound networking, observed no outbound attempts and was stopped afterward. Build rendering used public content loaders; no subscriber queries or mutations were introduced or performed.

Evidence: `.verification/newsletter-rebuild-20261024-092640Z/`, including `checks.json`, final/initial readiness logs, `newsletter-final.log`, `backend-final-checks.json`, `cfn-lint-final.json`, `compiled-http.json` and `preservation-final.json`. Existing verification evidence was not overwritten; the initial affected-group results were preserved separately before reruns.

## Release assessment and minimal next owner decisions

**GO:** local code/infrastructure review and separately approved isolated staging preparation. **NO-GO:** production website cutover, live provisioning, subscriber migration or any email until explicitly approved and the relevant gates below are met.

1. Confirm account/region, legal operator, monitored sender/support mailbox, lawful public mailing address, consent/privacy/retention and budget. No residential address or identity has been invented.
2. Inventory and contain every old deployment/alias, external scheduler, direct endpoint, webhook and hosting copy under separate authorization. Old implementations—including earlier fail-open Cron/webhooks and historically restored `/api/amazon` versions—are not disabled by this source change. Do not globally revoke shared SES/transactional credentials.
3. Resolve historical link formats/original-key provenance or staff a verified manual opt-out recovery process. Reconcile old SNS subscriptions, finite retries and outstanding suppression evidence **before** deploying the old-feedback 503 stub.
4. Approve dedicated AWS provisioning and new-system secret provisioning, then verify SES identity/DKIM/production access/quotas, scoped IAM, streams, feedback routing, alarms and log redaction. No old secret rotation is needed or authorized here.
5. Approve controlled export/import separately; reconcile suppressions and hold all ambiguous legacy consent. Do not mark `migrationComplete` merely because an import command finished.
6. Run isolated managed-service tests, including target Node 22 runtime, actual IAM denials, DynamoDB transactions/streams and SNS routing. Mocks/local schema validation cannot prove effective AWS behavior. A received-email/DKIM/one-click test needs its own explicit send approval and owner-controlled test audience.
7. Only after final approval, configure the website bridge and stage enable switches/control values. Reopen signup through a reviewed code change; enable weekly delivery last. Keep opt-out/feedback available during rollback and retain all ledgers and keys.

The [owner guide](./newsletter-aws-owner-guide-2026-10-24.md) contains exact console checks, parameter/environment names, initial disabled control JSON, packaging steps, conservative migration/rollback procedure and low/medium/higher-volume cost estimates. No further implementation or deployment approval is inferred from this local completion.
