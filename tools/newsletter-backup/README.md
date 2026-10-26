# Private local newsletter backup utility

**Local Windows terminal tool, not a website. No production integration has been performed.** There is no HTTP listener, browser storage, telemetry, startup service, scheduled task, Brevo connection, email transport or AWS write operation. Do not copy this tool into Next.js routes, Lambda deployment inputs, Vercel assets or public files. It has its own locked dependencies; the newsletter deployment allowlist excludes `tools/`.

Manual refresh and optional automatic refresh use temporary credentials for an independently approved read-only role. No persistent IAM access key is accepted or created. The tool never reads Secrets Manager, newsletter signing keys, Sanity, SQS message bodies, CloudWatch logs or an account-wide suppression export.

## What is authoritative

| Source | Meaning and backup coverage |
| --- | --- |
| Dedicated DynamoDB ledger `SUB#sha256(normalizedEmail)` | Email, current `PENDING` / `CONFIRMED` / `SUPPRESSED` / legacy `HOLD`, request/confirmation/suppression dates, consent fields, capability nonces and audience membership. Pending records may outlive the 24-hour confirmation link; pending count is not a count of unexpired links. |
| `AUDIT#id#request#nonce`, `confirm#nonce`, `suppress#event` | Immutable consent text/version/source and request, confirmation and suppression evidence. A matching request/confirmation pair is needed even to label a review candidate. Raw keys/nonces stay encrypted; review exports replace identifiers with hashes. |
| `MIGRATION#batch#id`, `MIGRATION-BATCH#batch` | Historical provenance, original active/suppressed state, source references and migration status. Legacy `HOLD` is never treated as active opt-in. |
| `EVENT#eventHash` | Processed SES event type/time/provider message reference and optional subscriber/campaign linkage. A generic `Bounce` event does not prove a permanent bounce; durable suppression audit/reason or SES account suppression provides that evidence. Not all events carry recipient linkage. |
| SES dedicated Contact List | Paginated explicit topic preferences, unsubscribe-all and update time. List defaults alone are not individual consent or unsubscribe. Individual opt-outs dominate later opt-in observations. The current implementation does not use SES `AttributesData` for consent; ListContacts does not back up that optional field. Reassess if the architecture starts using it. |
| SES account suppression, targeted by newsletter address | `GetSuppressedDestination` for each known newsletter address, including legacy migration addresses. `BOUNCE`/`COMPLAINT` is an additional exclusion. Only a specific NotFound response means absent; errors abort the entire sync. Unrelated transactional recipients are not enumerated. |

The complete dedicated DynamoDB table is scanned, preserving raw AttributeValue maps, arbitrary-precision number strings, article/campaign/send claims and durable controls inside the encrypted archive. Filtering a scan would not avoid its read cost and would omit disaster-recovery evidence. The table must be dedicated to this newsletter and independently approved. No index is scanned. The utility does not seed or modify `CONTROL` or any subscriber.

Raw pending feedback still in SNS/SQS, not yet committed to the ledger/SES, is **not** included. Transient bounce details not retained by the application cannot be reconstructed. Original Sanity records, external legacy suppressions, newsletter signing keys and original consent archives remain separate recovery responsibilities. This backup cannot establish that all legacy rights have been reconciled.

## Security model

- Default vault: `%LOCALAPPDATA%\Chronoverse\NewsletterBackups`. The directory must be **new**, local fixed NTFS, outside any Git ancestor and known cloud-sync/public folders. Choose an unsynced location. Initialization grants the current Windows owner and SYSTEM full control and removes inherited grants. Subsequent use rejects broader ACLs, another owner, network paths or reparse points. It does not silently repair an existing folder.
- Passphrase: hidden TTY prompt only, at least 20 characters; use a long independently chosen password or six random words kept in a separate password manager/offline recovery location. No password argument, environment variable, key file or browser storage. Losing it makes recovery impossible. It is never generated or printed by this tool.
- Encryption: AES-256-GCM, random 96-bit nonce per file, authenticated version/purpose/KDF header, random 256-bit vault salt; scrypt `N=131072,r=8,p=1` derives a 256-bit key. Each file carries its salt/header and can be authenticated with the passphrase. Fixed KDF parameters and size limits reject hostile envelopes. The passphrase and decrypted data necessarily exist in process memory. Key buffers are cleared on close, but JavaScript strings/OS memory cannot be reliably erased; use a trusted, locked Windows session and BitLocker/device encryption, including the pagefile. Administrator/malware compromise is outside the owner-only ACL boundary.
- AWS CLI's temporary login/SSO cache remains in the owner's normal AWS profile cache outside the vault. Protect that Windows profile too. The utility captures credential export over a private pipe into memory; it never prints, persists or passes credential values in command arguments. API email parameters stay inside SDK calls, not process arguments. Never enable AWS debugging, terminal transcription, crash dumps or SDK logging around private operations.
- The private `auth/config` permits only the generated login/SSO profile. Static credential files are disabled; custom credential processes/endpoints and ambient credential variables are not used. SDK endpoints are fixed to Stockholm HTTPS, TLS verification stays enabled, and temporary credential expiry/session token plus the exact STS assumed-role/account are checked before data reads and on credential refresh. Root/IAM-user/direct admin sessions are rejected unless an operator incorrectly approves that same role; role identity alone does not prove its policies are read-only. Effective IAM requires owner review.
- Snapshots are written only as ciphertext, flushed, read back, authenticated and atomically renamed before the last successful snapshot advances. Failed pagination/authentication/read/disk operations never substitute empty results or advance the saved time. An exclusive owner lock prevents concurrent writers. An abrupt process kill can leave an encrypted `.partial-*` file or stale `.owner-lock`; do not auto-unlock or delete evidence. First confirm all utility processes have stopped, preserve the folder, and privately inspect/recover. Normal `q` cancels/drains a running read before releasing the key/lock.
- Snapshot sequence and previous-file SHA-256 detect missing/reordered/modified retained links. AEAD detects corrupt/tampered ciphertext and wrong passwords. Neither proves source truth, atomic capture, or freshness against deletion of the entire latest suffix by someone controlling the disk; keep a trusted independent checkpoint/offline encrypted copy. Do not describe this as immutable/WORM storage.

## Local installation and offline use

Requires Node 22+, Windows PowerShell 5.1+, fixed NTFS storage. Install the owner utility independently; never install it into the website build:

```powershell
# LOCAL files/public package downloads only; no AWS connection.
npm ci --prefix tools/newsletter-backup --omit=dev --ignore-scripts --no-audit --no-fund
npm test --prefix tools/newsletter-backup
node tools/newsletter-backup/cli.mjs --help
```

Copy `config.example.json` to a **private external** working folder, enter the approved nonsecret region/account/role/table/list identifiers and AWS CLI executable path, and keep that private file outside Git. It contains no keys or mailing address. Placeholders intentionally fail validation. Do not use an arbitrary table or broad administrator profile.

```powershell
# LOCAL ONLY: enter the private config path, never a password/key in arguments.
$PrivateConfig = Read-Host 'Private config JSON path'
node tools/newsletter-backup/cli.mjs init "--config=$PrivateConfig"
node tools/newsletter-backup/cli.mjs status
node tools/newsletter-backup/cli.mjs open
node tools/newsletter-backup/cli.mjs export-review
```

`init` creates a new encrypted `vault.cvnb` and nonsecret `auth/config`. It does not authenticate or read AWS. `status`, unapproved `open`, `export-review`, `verify`, `restore-local` and `rotate-local` work offline. `open` starts with automatic sync **INACTIVE**; `s` starts manual refresh in the background, `a` opts into automatic hourly attempts, `p` pauses/cancels, `v` shows stored aggregate statistics and in-progress state, and `r` saves an encrypted review bundle. `q` cancels/drains before closing; an already completed atomic commit remains saved. AWS reads are blocked unless the session was explicitly approved. Passwords/records are never printed. Summary timestamps/counts come from the last fully saved snapshot, not a live view of AWS.

## Separate owner approval: authentication and AWS reads

**Not executed. Production integration remains BLOCKED pending approval of the exact resources, effective role permissions, device protection and recovery/retention policy.** AWS CLI v2 >=2.32.0, installed from the official signed distribution, is required. Its executable path is private configuration. The tool does not create an IAM user, role, policy, key, service or organization, and never logs in automatically.

Review `iam-readonly.example.json`: replace the table and contact-list ARN placeholders privately. Only `DescribeTable`, strongly consistent paginated `Scan`, `GetContactList`, `ListContacts`, targeted `GetSuppressedDestination`, and STS identity are needed. No table/index/list enumeration, send/write/delete, Secrets Manager, queue consumption or S3 permission is needed. SES account-suppression reads require regional `Resource:"*"`; they cannot be restricted to this contact list by the policy, so the implementation limits reads to known newsletter addresses. A compromised role could read other suppression addresses if known. Use a dedicated short session/MFA, no other broad policies, and verify the role's trust and effective permissions independently. The example is not an automatically attachable deployment template. [SES v2 IAM resource support](https://docs.aws.amazon.com/service-authorization/latest/reference/list_sesv2.html)

Preferred console-auth route: use an approved **federated/assumed read-only role**, not root or an IAM user. AWS `login` may require the separately reviewed `SignInLocalDevelopmentAccess` permission for that identity. The owner must approve any IAM change first. The profile must resolve to the exact configured assumed role. [AWS console-based temporary login](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sign-in.html)

```powershell
# FUTURE APPROVED AUTHENTICATION: opens AWS login and writes its temporary cache.
# Not part of the offline tests or current authorization.
$Vault = Join-Path $env:LOCALAPPDATA 'Chronoverse\NewsletterBackups'
$env:AWS_CONFIG_FILE = Join-Path $Vault 'auth\config'
$env:AWS_SHARED_CREDENTIALS_FILE = Join-Path $Vault 'auth\no-static-credentials'
aws login --profile newsletter-backup --region eu-north-1
# Stop if the wrong role/account is offered. Do not choose root/admin.
# Separately APPROVED production subscriber reads start only at this step:
node tools/newsletter-backup/cli.mjs open --aws-read-approved
# When finished, use q, then sign out of this temporary login if desired:
aws logout --profile newsletter-backup
Remove-Item Env:AWS_CONFIG_FILE, Env:AWS_SHARED_CREDENTIALS_FILE -ErrorAction SilentlyContinue
```

Alternatively use an **existing approved** IAM Identity Center session. In private config set `auth` to `{ "kind":"sso", "session":"APPROVED_SESSION", "startUrl":"https://APPROVED.awsapps.com/start", "region":"eu-north-1", "roleName":"APPROVED_READ_ONLY_PERMISSION_SET" }`; use the actual SSO region if different. Initialize the private profile, then after approval run `aws sso login --profile newsletter-backup` with the same private config environment and enter the utility separately. Do not enable Organizations, create users/keys or upgrade an account merely to satisfy authentication. If neither temporary role route is available, remain offline until the owner approves a suitable access method. [AWS SSO profile format](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html)

## Synchronization and unavailability

Every refresh verifies role, account, table ARN/hash schema/status and contact-list/topic before collection. DynamoDB scan pages and SES contacts follow all continuation tokens, including empty pages. Repeated/invalid tokens and incomplete reads fail closed. Identical records are deduplicated; conflicting variants remain and cannot be review-eligible. The archive is additive with respect to known suppression: earlier local negative observations remain even if AWS later omits or changes a contact.

Strongly consistent Scan still **does not provide a point-in-time snapshot**, and SES is read later. `startedAt`/`completedAt` identify a read window, not an atomic cut. New opt-outs can occur after a page is read. Managed PITR and a separately approved freeze/reconciliation are needed for authoritative full-system disaster recovery. [DynamoDB Scan consistency](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_Scan.html)

SES calls are serial, at least two seconds apart; explicit throttling gets at most three paced attempts. SDK retries are disabled. This does not coordinate the account-wide SES API limit with live Lambdas or other tools. Prefer an approved quiet read window; stop on contention, do not weaken unsubscribe checks or raise quotas to make backup succeed. For 1,000 known addresses, targeted suppression checks alone take roughly 33 minutes, plus pagination/network/authentication. Page/record/payload limits stop oversized or looping work. The tool prioritizes privacy over account-wide suppression-list enumeration.

Automatic refresh runs **only inside the unlocked `open` process**, after explicit `a`. The next attempt is one hour after the previous completion; there is no cloud scheduler, Windows service or autostart. It never overlaps another refresh. Failure pauses automatic work and retains prior counts/time; reauthenticate separately and manually refresh before opting in again. Offline, powered off, asleep, closed, expired-session or paused time has no local updates. After wake, a due timer may attempt a read; the saved timestamp still determines staleness. Normal quit aborts/drains in-flight reads. Reopening always starts automatic work inactive.

## Retention, verification and recovery

Vault contents: encrypted `vault.cvnb`, sequential encrypted `snapshot-00000001.cvnb` etc., optional encrypted `recovery-UUID.cvnb`, nonsecret private `auth/config`, and transient lock/ciphertext staging files. No subscriber CSV, plaintext database or plaintext index is written. All committed snapshots are retained; **there is no automatic purge**. Default limit is 100 snapshots, configurable 2–1,000 at initialization; additionally the retained snapshot chain is capped at 128 MiB and each decoded payload at 64 MiB. Limits pause synchronization instead of deleting evidence. Review disk usage and lawful backup retention before integration, periodically thereafter, and before reaching a limit. Recovery bundles also consume disk space and are not automatically deleted.

Keep encrypted offline copies of the whole vault/chain on an independently protected device under a documented owner retention schedule. Do not delete individual links or start a fresh blank vault to evade a limit: that can discard historical suppressions. Manual `rotate-local` creates a new private active vault seeded with the latest encrypted source data plus historical consent/migration/event evidence and the union of known suppressions. It preserves the old archive unchanged, records its digest, resets authentication and retains the original last-read timestamp; rotation is not a fresh AWS sync. Keep older archives for full-history recovery. Rotation, archive purge and cloud restoration are never automatic. Local source backups are not subscriber-data backups; do not include the vault in Git/source review archives.

```powershell
# LOCAL ONLY: authenticate a standalone encrypted file, show counts only.
$EncryptedFile = Read-Host 'Encrypted snapshot or review file path'
node tools/newsletter-backup/cli.mjs verify "--file=$EncryptedFile"
# LOCAL ONLY: restore a copied vault/chain to a NEW owner-private folder.
$Archive = Read-Host 'Encrypted archive directory'
$NewVault = Read-Host 'New private NTFS directory (must not exist)'
node tools/newsletter-backup/cli.mjs restore-local "--from=$Archive" "--directory=$NewVault"
# Optional LOCAL manual active-vault rotation; preserves the old folder.
# Choose another new directory; never overwrite an existing vault.
$RotatedVault = Read-Host 'New active vault directory (must not exist)'
node tools/newsletter-backup/cli.mjs rotate-local "--from=$Archive" "--directory=$RotatedVault"
```

Standalone verification proves that file's authentication, not completeness/freshness of an entire chain. `restore-local` copies ciphertext only, validates the chain/scope and rebuilds the permitted auth profile (console-login profiles require re-login; an existing SSO cache may still be valid); it performs **zero AWS writes**. Restore failures leave only encrypted quarantine files; preserve and inspect rather than overwriting. A new Windows account can recover using the passphrase; no dependence on the old Windows DPAPI identity. Re-login only after separately approved integration.

An AWS restore is a different operation: reconcile the latest negatives from AWS, SES and legacy records; preserve uncertain send/idempotency claims; keep all five switches and durable controls disabled; revoke pending enrollment capabilities under an approved procedure; preserve unsubscribe continuity and existing signing keys; validate before any activation. This utility does not implement cloud restore, control replay, contact creation, resubscription or mail redrive.

## Future Brevo migration

`export-review` creates an **encrypted JSON review bundle**, not a directly importable active-contact CSV. It retains normalized addresses/hash identities, consent evidence/provenance, conflict flags and all historical suppressions. Every destination record is `SUPPRESSED` or `HOLD`; `activationAuthorized=false`, `sendable=0` describes this export policy, not a measurement of the live sending audience. Direct subscriber nonce fields and `CONTROL` settings are omitted. Legacy freeform provenance remains sensitive and must be reviewed privately for embedded URLs/tokens before any external mapping. The ordinary snapshot preserves raw fields encrypted for a separately controlled full-system investigation.

For a future approved migration, reconcile fresh source/SES opt-outs first; map suppressed addresses to Brevo marketing-email blocklisting, keep pending/legacy/ambiguous records out of active lists, and manually review explicit consent/version/time/source for remaining candidates. Hash-only suppression records require resolution and cannot be uploaded as email addresses. Importing a contact alone must never authorize campaigns or reset Brevo unsubscribe state. A future mapper can use Brevo marketing-email `emailBlacklisted=true` for suppressed records; never force-merge or clear an existing blocklist during recovery. [Brevo contact fields](https://developers.brevo.com/reference/create-contact) Brevo-specific field mapping, CSV decryption/conversion, uploads, test imports and campaign activation require a separately approved implementation/test plan. No automatic reactivation is available here. `consentReviewCandidate` means evidence to inspect, not legal approval or a sendable audience.

## Cost and unresolved gates

No additional recurring AWS infrastructure: no Lambda, scheduler, alarms, table, S3 bucket, subscription, secret or Brevo plan. Incremental usage is strongly consistent DynamoDB scans and existing authentication/SES reads. Using the previous Stockholm rate, 10,000 billable RRUs would be approximately **$0.001345** before credits/allowances; real consumption depends on ledger size and scan frequency. Filtering does not eliminate scan read cost. No live billing was inspected. Existing provider-side audit/data-event logging may capture API parameters or add charges; review its access/retention privately before integration. This tool does not change audit settings and promises no subscriber data in its own logs, not control over AWS audit behavior. Local encrypted storage and owner time remain costs; full-table history grows. Do not infer permanent free usage from credits. [Regional DynamoDB rates](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonDynamoDB/current/eu-north-1/index.json)

Before any real integration: approve exact resources and effective temporary role/trust, verify supported CLI authentication on the owner's account without keys or paid-plan changes, approve device encryption/passphrase custody/offline-copy and lawful retention, synthetic-test managed read permissions/pacing, and reconcile legacy/pending feedback coverage. The existing newsletter's production activation blockers remain independent. No real subscriber data has been retrieved by development/tests, and no deployment or AWS permission/configuration change is authorized by this guide.
