# AWS-independent signup release

Historical preparation only. The owner-approved [27 October forward-only
release](newsletter-forward-optin-release-2026-10-27.md) supersedes the commands,
original-key recovery requirements and nonempty-Ledger assumptions below.

**Historical activation procedure:** superseded by [the forward-only 27 October release](newsletter-forward-optin-release-2026-10-27.md). Do not run this original-key recovery procedure or its older launcher. The key is unavailable; fresh AWS consent isolation and verified manual support replace that absolute gate. Previous packages are preserved.

Release preparation is complete locally. **Production activation is BLOCKED by the missing original legacy v1 key and the absence of verified production feedback processing.** No connector, AWS call, email, upload, deployment, commit or push was performed for this release preparation.

## Artifacts and architecture

Local bundle: `E:\cv-newsletter-aws-independent-signup-20261026\release`.

- `newsletter-runtime.zip`: fresh current source, 13 runtime modules plus the integrity-verified legacy article exclusion JSON, production package metadata and all 43 locked dependency packages. No migration script, test fixture, environment file or credentials.
- `main-template.json`: generated from the current `services/newsletter/template.json`, not a previous deployed/pinned template. Uses a new content-addressed S3 key and requires its actual version ID. Preserves logical resource identities, Ledger retention/deletion protection and suppression paths.
- `discovery-template.json`: generated from the current companion source for review; includes the same new runtime and a separately disabled schedule switch. **The signup procedure never deploys this companion or invokes discovery.** Existing discovery state stays untouched.
- `main-disabled-overlay.json`, `discovery-disabled-overlay.json`: nonsecret disabled overlays, not complete private production parameters. The release helper carries existing main-stack parameter values forward and inserts the actual new runtime version.
- `cloudshell-release.py`, `release.json`, `runtime-files.json`, `package-lock.json`, `SHA256SUMS`: executable staged procedure, provenance and integrity evidence.

Runtime SHA-256: `fdc54390353e6947b9b9fa143cf000f06689c6f1e867dbd9f29d47fccd2f1b25`.

All application runtime files are fresh. Installed dependencies contained `@aws-sdk/util-dynamodb` 3.996.9 instead of locked 3.996.7, so those installed bytes were rejected. Packaging reused only dependency bytes from the previously verified ZIP with SHA-256 `e2fb9418e3bf8da18c339a9e9b3716c5d49b3e4fe97017710b68809c351c32d4`, after verifying exact lockfile equality and every locked package version. No old runtime source or template was reused. The extracted new ZIP is tested independently from the installed dependency tree.

AWS owns registration at `https://lh71lvbqi8.execute-api.eu-north-1.amazonaws.com/register`, confirmation, unsubscribe, DynamoDB persistence and SES email. `PublicOrigin` is exactly `https://lh71lvbqi8.execute-api.eu-north-1.amazonaws.com`. Sanity supplies published content only. Vercel collects no new subscription address and has no AWS subscriber bridge, bridge URL/key contract or AWS credentials.

The website form is replaced locally by an external AWS registration link component. The existing code pause remains **true**, hiding the link until AWS readiness and the controlled test pass. This website change is not published. The old website admission POST remains closed (503); old confirmation/unsubscribe URLs redirect clients to AWS rather than proxying requests. GET uses 303; POST uses 307 to preserve the historical form/one-click body. No redirect acknowledges a subscription mutation. AWS verifies the signed token and purpose/nonce, and persists the result. Duplicate/conflicting tokens remain rejected; only identical historical query/form tokens are accepted on legacy aliases. Canonical AWS routes retain their stricter origin/body checks.

Legacy clients that do not follow redirects require the AWS preference URL or support-assisted opt-out; do not claim their one-click behavior was verified. Live browser/mail-client redirect behavior is a production check before publishing. New AWS emails use AWS URLs directly.

## Release constraints

Region `eu-north-1`; account `957261948953`; main stack `chronoverse-newsletter-v2`. Never execute or reuse **`aws-register-origin-20261026`**. The helper generates its own new change-set names and only executes the matching name/ID saved for this release.

Initial update: all five mail/approval flags false, `WeeklyScheduleEnabled=false`, registration/confirmation CONTROL fields unchanged and paused. The template's additional schedule switch defaults false even if future mail approvals change. Existing discovery schedules must remain DISABLED.

Controlled test: registration/confirmation and their retirement/compliance prerequisites can become true **only after explicit owner approval**. DeliveryEnabled and CONTROL.deliveryEnabled remain false. The API SES grant stays exact identity/configuration-set/FromAddress scoped and is additionally limited to the authorized test recipient. All three admission routes (`GET /register`, `POST /register`, `POST /subscribe`) are set to AWS_IAM before enabling durable enrollment. The operator signs registration with SigV4. Token-based confirmation and unsubscribe remain available without IAM. No public admission opens during this test.

The website needs no AWS/Vercel environment change for the link architecture. Existing unused bridge environment variables need not be read, rotated or copied; their later removal is optional housekeeping. Do not remove original-key recovery material until continuity is proven.

## One owner-run CloudShell procedure

These are **future execution commands**, not actions already authorized or performed by this preparation. Use an approved operator session in the correct AWS account. Every `--approve` below authorizes that named stage only; do not run later stages after a failed check. The `arm-test`/`open-public` approval also attests actual legacy-sender retirement and compliance approval. `migrationComplete` must already have genuine migration evidence; the script never sets it.

Required tools: Python 3 with boto3/botocore, AWS CLI, `sha256sum`. The operator needs existing-stack CloudFormation/IAM/Lambda/API Gateway rights, versioned artifact upload, scoped Secrets Manager read, SES inspection, Scheduler inspection, SNS/SQS inspection, controlled test SNS publish, conditional CONTROL update and test-record reads. Private enrollment needs `execute-api:Invoke` on this API's `$default` `GET/register` and `POST/register` routes. No access keys are packaged or copied to Vercel.

### A. Upload the bundle to CloudShell and apply the disabled update

Upload `cloudshell-signup-aws-only-20261026-fdc54390353e.tar.gz` from the external release directory using CloudShell's file-upload UI. Verify its SHA-256 against `FINAL-REPORT.md` before extraction. In CloudShell:

```bash
umask 077
mkdir signup-aws-only-20261026-fdc54390353e
tar -xzf cloudshell-signup-aws-only-20261026-fdc54390353e.tar.gz -C signup-aws-only-20261026-fdc54390353e
cd signup-aws-only-20261026-fdc54390353e
```

Then run in that new private directory:

```bash
umask 077
export AWS_DEFAULT_REGION=eu-north-1
export AWS_PAGER=""
sha256sum -c SHA256SUMS
python3 -c "import boto3, botocore; print('AWS SDK available')"
python3 cloudshell-release.py prepare --phase disabled --approve
cat change-set-review.json
```

The prepare step checks identity, current stack logical IDs/types, explicit paused CONTROL values and disabled schedules. It uploads only the new runtime to its content-addressed artifact key with `If-None-Match:*`, AES256 encryption and a real S3 VersionId. Existing matching content can be verified/reused; different bytes are never overwritten. It creates a **new UPDATE change set** from the supplied fresh template, preserves existing private parameters with UsePreviousValue, and rejects resource additions, removals and any possible replacement. It does not execute the change set or write CONTROL.

Review `change-set-review.json` and the new change set in CloudFormation. Confirm only intended code/configuration/policy updates; no data resource replacement, no unexpected IAM grant, no schedule activation. If source/deployed resource identities differ, stop rather than adapting the stack blindly.

After owner approval of that exact change set:

```bash
python3 cloudshell-release.py execute --phase disabled --approve
```

This update is safe to prepare/apply while the legacy key is missing because enrollment and all sending gates remain off. It does not resolve the key blocker or prove feedback delivery. Keep `.cloudshell-release-state.json` private: it records the original template/code hash for rollback and the exact new change-set IDs. Do not upload that state to GitHub or mix it with another release.

### B. Resolve the genuine safety blockers before any email

1. **Recover the exact original legacy v1 unsubscribe secret** from its authentic production source/backup. Merge it as `legacyV1Key` into the existing dedicated AWS secret without replacing/rotating `capabilityKey`, changing other fields, resetting subscribers or inventing a key. Recovery is not automated because the original value is missing. A new random key cannot restore historical links. If recovery is impossible, stop signup activation pending a separately reviewed subscriber-continuity resolution.
2. Reconcile historical SES/SNS feedback destinations. The old website `/api/newsletter/feedback` deliberately returns 503; it is not a working feedback consumer. Ensure no active required destination still depends on it. Preserve suppression history and process existing queues/DLQs; never purge them to pass checks.
3. Verify current SES identity/production access/sender/postal address and migration/compliance evidence. The main helper verifies the current SES configuration-set event destination, exact account/source-ARN topic and queue policies, encrypted SQS queue/subscription envelope, enabled feedback and contact mappings, no backlog/DLQ, exact new Lambda hashes and absence of worker sending rights. Historical reconciliation remains an explicit operator attestation, not something inferred from a healthy new subscription.

Then run:

```bash
python3 cloudshell-release.py readiness --verify-original-key --historical-feedback-reconciled
```

The key comparison uses hidden input and prints no key. It fails immediately if the secret lacks the original key. Its proof is bound to the actual secret version. The historical flag must only be used after real reconciliation. Passing this step certifies configuration checks; it does **not** claim an inbox, confirmation or suppression event succeeded.

### C. Approved private double-opt-in test, one mailbox only

Only `ahmednasr2376@gmail.com` is authorized. If that record already exists, is suppressed/held/confirmed, or a signup attempt is uncertain, the helper stops. Never reset it, remove suppression, bypass a cooldown or substitute another address.

After explicit approval for the single confirmation email and controlled test mutations:

```bash
python3 cloudshell-release.py prepare --phase test --approve
cat change-set-review.json
python3 cloudshell-release.py execute --phase test --approve
python3 cloudshell-release.py arm-test --approve
python3 cloudshell-release.py signup-test --approve
```

Inspect the test change set before executing it. It enables only API confirmation sending, the required SES configuration-set sending option and registration/confirmation flags; digest sending and both schedules stay off. CONTROL remains paused during the update. `arm-test` verifies the single exact recipient-limited API grant, closes admission behind IAM, and only then conditionally changes the named registration/confirmation/retirement/compliance CONTROL fields. It preserves all other fields. Public unsigned registration must be rejected. The operator's signed GET/POST use the actual AWS `/register` handler, with explicit consent; no bridge or Lambda invocation is used.

`signup-test` records the attempt before making it and cannot automatically resend after timeout. Verify the actual inbox email, sender/domain, AWS confirmation URL and expiry. Open its GET review page and check it did not confirm automatically; deliberately submit the confirmation POST. Confirm replay fails without changing consent. Record this evidence privately, without logging/copying capability URLs into release reports. Then:

```bash
python3 cloudshell-release.py verify-confirmation --approve
python3 cloudshell-release.py feedback-test --approve
```

The first approval attests actual inbox receipt and intentional confirmation; it verifies real CONFIRMED persistence, consumed nonce, durable accepted send claim and completed contact outbox. Wait for contact synchronization if needed; do not send again.

The second command publishes **one explicitly synthetic Complaint** for the authorized mailbox through the real SNS → SQS → consumer path. It is not a genuine SES complaint or an email. If the operator lacks SNS publish permission, stop and obtain a reviewed test permission/method; never weaken the service topic policy. Wait for the feedback consumer, then:

```bash
python3 cloudshell-release.py unsubscribe-test --approve
python3 cloudshell-release.py finish-test
python3 cloudshell-release.py close --approve
```

These verify the managed synthetic complaint transitioned the test record to permanent SUPPRESSED, the contact outbox opted it out, and secure AWS unsubscribe GET/repeated POST/wrong nonce preserve it. Because complaint suppression runs first, the unsubscribe test verifies safe processing/idempotency on an already suppressed record, not a second state transition. Local regressions separately exercise confirmation-to-unsubscribe transitions. The helper also requires an actual SES Delivery event for the real confirmation message in the Ledger. It does not substitute SES acceptance or the synthetic complaint for inbox/delivery proof.

If `finish-test` fails, resolve the specific pending event/outbox issue without resetting the record or resending mail. Always close enrollment on abort. The final test record stays SUPPRESSED; no cleanup reactivation is permitted.

### D. Separately approved public registration and website publication

Only after the controlled test passes and the owner authorizes public registration:

```bash
python3 cloudshell-release.py prepare --phase public --approve
cat change-set-review.json
python3 cloudshell-release.py execute --phase public --approve
python3 cloudshell-release.py open-public --approve
```

CONTROL stays paused during the public change set. `open-public` rechecks readiness, the single exact sending grant and controlled evidence, restores only the three admission routes to authorization NONE, then enables durable registration/confirmation. It keeps digest gates and schedules false. No campaign, planner, worker or discovery invocation occurs. Read back `/register`: unsigned GET must return the actual form. Check invalid confirmation/unsubscribe tokens fail without mutation. Re-submitting the now-suppressed test mailbox must not send another email or reactivate it.

Only now prepare the minimal website publish: change `NEWSLETTER_SIGNUPS_PAUSED` to false, update the pause-specific component/metadata assertions and privacy copy to describe AWS-owned enrollment with weekly delivery still paused. Re-run typecheck, build and tests for that exact switch. The reusable link and management redirects are already prepared in this change; no secret or bridge configuration is needed. Verify master/remote and the exact reviewed files, then commit/push normally **only with website publishing approval**. Preserve the old Vercel production deployment. Verify the matching deployment, mobile/keyboard link behavior, AWS register page, and historical redirect GET/POST behavior with only the authorized mailbox. No connector is needed; the owner can inspect the Vercel dashboard if deployment status is inaccessible.

Do not publish the link or claim live signup is ready from the local package alone. No public opening or website publishing is authorized by this preparation.

### E. Failure and rollback

On any failure after enrollment is armed:

```bash
python3 cloudshell-release.py close --approve
```

This conditionally closes only registration/confirmation on the existing CONTROL, while requiring delivery false. It never replaces the record or changes publication checkpoints/content approvals. Leave feedback/contact consumers and unsubscribe available, retain all subscriber/audit/suppression records, send claims and S3 versions. Keep private IAM route guards on a failed test. Do not delete the test subscriber or clear provider suppression.

If the CloudFormation update itself fails, let CloudFormation's normal rollback complete and inspect its state; do not execute the old pending change set. For a later code rollback, use the private saved original template/artifact references to prepare a **new reviewed UPDATE change set**, forcing every mail/approval/schedule gate false and retaining the verified AWS PublicOrigin. Reject all data replacement/deletion and retain feedback/unsubscribe continuity. Never restore Ledger/S3 data to an earlier version to roll back code. The release helper deliberately does not automate applying the older runtime.

For a published website regression, restore the recorded previous Vercel deployment or publish a new reviewed revert commit; never force-push. Closing AWS admission is independent of website rollback. There is no website subscriber database or bridge secret to restore.

## Local verification evidence

Logs and hashes are under `E:\cv-newsletter-aws-independent-signup-20261026\evidence`. Final release reporting includes actual typecheck/build/test/lint outcomes, fresh SAM transformation and CloudFormation lint, all activation combinations, extracted-ZIP regression results, sensitive-data scan and exact source diff. These checks never establish production SES delivery or legacy-key continuity.

Completed checks: typecheck and production build pass; the full root suite has 424 passing tests, including 291 newsletter tests. The extracted new runtime passes 291 tests on both Node 24 and Node 22.23.4 (Windows x64); managed Lambda ARM64 execution is a production check, not a local claim. Changed-file lint, fresh SAM translation, CloudFormation lint and all 32 activation combinations pass (256 main and 128 companion source/translated evaluations). The local SAM guard records zero AWS API or socket attempts. No real mailbox, subscriber record or feedback message was touched.

No new fixed-cost AWS service is introduced. The update reuses the existing API/Lambda/Ledger/SES/SNS/SQS and artifact bucket; temporary IAM route authorization and a recipient condition add no service. Existing usage/storage/Secrets Manager charges remain. Cost measurement and article discovery are outside this signup release.
