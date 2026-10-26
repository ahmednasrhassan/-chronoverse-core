# Newsletter operational independence — local implementation

**Local source only. Not deployed, activated, uploaded or published.** The existing AWS Change Set and previously verified release ZIP/templates were not changed. Those artifacts represent the earlier website-dependent implementation and must not be executed/deployed as this independent revision. New packaging, hashes and a newly reviewed change set require separate authorization.

## Runtime and public management

The existing five Lambda functions, ledger/GSI/stream, SES configuration/list, four queues, SNS feedback, Scheduler, send lease, suppression, retry/idempotency and four alarm groups remain. No new AWS service or resource is authored. The API gains GET/POST `/register`, GET `/confirm`, GET `/unsubscribe`, and GET/POST aliases for the existing `/api/newsletter/confirm` and `/api/newsletter/unsubscribe` paths, using its existing Lambda. Existing POST `/subscribe`, `/confirm`, `/unsubscribe` remain. SAM generates eight additional API invocation permissions (38 authored resources; expected 50 translated including stage/permissions).

`PublicOrigin` is an empty-by-default HTTPS origin, with no path or trailing slash. Choose the independently hosted API Gateway endpoint, or a separately approved custom origin after disabled provisioning. No domain/certificate/DNS is assumed or created; a generated API reference is not placed in the function environment, avoiding a circular API/function dependency. Empty/invalid origin denies registration and new delivery links before a mail claim. Existing valid unsubscribe capabilities can still be processed without an Origin header or bridge key. Already-mailed website URLs cannot be rewritten: preserving their hostname/path reachability requires a separately approved direct AWS routing/DNS/TLS cutover. The path aliases are implemented, but no hostname routing is assumed or changed.

Public registration uses the API Gateway payload-v2 `requestContext.http.sourceIp`, method and exact route key. Forwarded/Vercel IP headers and submitted fingerprints are ignored. A purpose-separated HMAC with the capability key supplies the existing ten-per-hour client limit; the existing one-per-address-per-day limit, explicit consent and double opt-in remain. No website bridge key is needed. The old authenticated bridge is optional compatibility, not the public interface. It remains subject to its original private-key validation.

GET confirmation/unsubscribe render accessible, script-free forms without reading a secret or changing subscriber state. They do not echo the token; POST to the current document retains the query. Signed, purpose/nonce-bound POST transitions preserve expiry, single-use confirmation and permanent opt-out. RFC8058 POST `List-Unsubscribe=One-Click` to the tokenized `/unsubscribe` URL is supported; digest messages construct `List-Unsubscribe` and `List-Unsubscribe-Post` headers. Actual SES header delivery/interaction with its existing list-management headers remains a managed-service validation gate. SES's preferences link and feedback opt-out remain independent safeguards.

Responses are non-disclosing and carry no-store, no-referrer, nosniff, noindex and restrictive CSP headers. No CORS, admin, upload, publish, migration or restore endpoint is exposed. Query/body/header logging must remain disabled at API Gateway and Lambda. Tokens are present only in their intended private email link/request, never diagnostic logs or echoed response HTML. No actual email or subscriber record was used in local tests.

## Private content contract and intake boundary

The production dependency factory selects `createContentSource`, never `fetchArticles`. The old RSS parser/fetch helper remains an optional compatibility utility under regression tests; it is not selected by AWS runtime construction. Article URLs are canonical references in email, not fetch targets. They can point to the website or another approved source without becoming an operational dependency. Full referenced article reading still depends on the chosen reference host.

The adapter performs one bounded SigV4 HTTPS GET of an exact S3 JSON object, expected owner and Stockholm endpoint. It denies redirects, non-JSON, failures, unversioned objects and content exceeding 2 MB. It uses the already-installed Smithy signing/checksum packages, promoted to direct exact locked dependencies; no package/version download was performed. Only the planner can receive `s3:GetObject`, scoped to the exact object and same account, conditionally on configured bucket plus the existing digest gates. No bucket, writer role, KMS key, upload API or additional content database is created.

`ContentBucket` defaults empty; `ContentManifestKey` defaults `newsletter-content/approved.json`. The existing artifact bucket must **not** be assumed compatible. Founder review must establish the exact name/account/region, private access, dedicated prefix isolation, versioning, SSE-S3 or separately reviewed KMS needs, retention, write authority and rollback policy. No bucket metadata or credentials were accessed. Select an approved existing bucket/prefix through parameters; a separate bucket decision remains outside this task if reuse is unsuitable.

The independently supplied `CONTROL` additionally requires exact `contentSourceApproved=true` for digest delivery and a real numeric UTC-millisecond `contentStartAt` before source acquisition. Neither field is seeded. These are durable attestations, not extra enabled deployment defaults. Never choose or backdate cutover automatically, reset `DISCOVERY`, or clear existing article/recipient claims.

`content-manifest.example.json` is intentionally invalid/unapproved. A publisher must supply:

- Version 1; a positive monotonically increasing `sequence`; explicit root and per-article boolean `publicationApproved`; actual approver identities and approval timestamps.
- Stable original IDs (existing GUIDs can be preserved), HTTPS canonical references, plaintext titles/summaries, original UTC ISO publication times, source ID/revision and SHA-256 references to separately retained approval/publication evidence.
- Root approval time no later than observation; expiry after observation and within seven days of approval. Article approval cannot postdate root approval. Neither late approval nor a changed timestamp may backdate closed-week eligibility.

The JSON is an approval record trusted through reviewed S3 write authorization, **not** independent proof that the named person approved it. An upload alone is not approval. Actual publisher identity, original evidence, who may approve/upload, approval/revocation procedures, freshness cadence and cutover remain founder decisions. This implementation does not invent them, auto-import Sanity, or provide a speculative CMS/editor workflow. The read adapter, schema, invalid draft example and offline inspection are implemented; live editorial publishing is unconfigured and unverified.

Offline counts-only inspection (reads only the operator-selected file; no AWS, upload or approval):

```powershell
node services/newsletter/scripts/content.mjs <private-manifest.json> <approved-cutover-UTC-ISO>
```

An invalid example must fail validation. Do not put real publication evidence, private approver information, credentials or production data in Git or fixtures.

## Time, replay and concurrency

The complete current approved manifest is validated before use. Duplicate identities/URLs, unsafe data, absent provenance, stale or false/string approvals fail closed. Eligibility requires the original publication at/after approved cutover and the later of publication/approval before the existing half-open weekly end. The retained first `DISCOVERY.start` is an additional lower bound. An old article approved today cannot evade the original-publication cutoff; a late approval is considered in a later period, not retroactively inserted into a closed one.

`CONTENT#STATE` conditionally retains the greatest observed sequence plus exact source hash/version and approval metadata. Lower sequences and same-sequence replacement/version conflicts are rejected. A campaign freeze transaction checks that checkpoint, so a superseded concurrent acquisition cannot freeze an older snapshot. Identical current version retries remain idempotent. Any new S3 version requires a higher manifest sequence. A restore must preserve this checkpoint; intentional rollback requires a newly approved higher-sequence manifest, not deleting state.

Existing deterministic ten-article campaign selection, pending backlog, stable identity/canonical tombstones and uncertain-send preservation remain. Original publication/source identity cannot be silently rewritten. Acquisition failure never selects cached backlog. Frozen campaigns require retained approval/provenance and unexpired manifest evidence; unapproved legacy campaigns are held. A frozen issue does not refetch mutable website/S3 content for each recipient. Urgent revocation therefore uses existing durable sending/content-source controls; stopping publication alone does not recall an accepted email.

## Cost comparison

Planning estimates reuse the saved 24 October Stockholm public-rate evidence, not a fresh price lookup, account bill or spending cap. No new fixed resource fee, secret, alarm, database, scheduler, gateway or paid add-on is added. Additional usage is S3 GET/storage/version retention, one small conditional ledger checkpoint write and one transaction checkpoint write per new issue, plus public-page requests/execution.

Using the recorded S3 rates ($0.023/GB-month, $0.0004/1,000 GET, $0.005/1,000 PUT), a 2 MB version every week is about 8.7 MB retained per month, approximately $0.0002 monthly storage added per month of retained history. After a year, roughly 0.104 GB costs about $0.0024/month, before other artifacts/history. Around 4.345 reads/writes per month cost under $0.0001 combined; retries, review cadence and versions increase usage. Publisher writes are a future separately authorized operation, not implemented uploads.

The prior gross budgets remain useful: paused $1.46–1.60/month; 100 weekly subscribers $2.06–2.30; 1,000 $2.82–3.10. With modest content history and about 1,000 extra public page visits/month, incremental usage should be below $0.01/month under the existing illustrative execution assumptions. A 1,000-person one-time enrollment also adds about $0.16 in SES Essentials mail, plus processing. These modeled low-volume cases remain below approximately $4, **not guaranteed**. Hostile traffic/retries, long execution, retained versions, existing SES Pro/Enterprise/add-ons, KMS, unrelated resources, taxes and credit/payment eligibility remain unverified and can exceed that target. Keep safety polling, PITR, retention, concurrency caps and alarms.

## Recovery, validation and deployment gates

The encrypted backup tool and local restore were not changed. Its full ledger archive includes new content/checkpoint/campaign evidence, but it does **not** download S3 objects or implement AWS restoration. Retain approved S3 object versions and original editorial evidence separately under an approved policy. Production recovery requires a controlled exercise preserving the ledger and S3 approvals/checkpoint, current opt-outs, uncertain sends, original signing keys and unsubscribe continuity, with all controls off. No production recovery readiness is claimed.

Before any deployment: approve storage isolation/retention/editorial authority/cutover and public origin; privately review exact parameters/effective roles; regenerate/inspect local artifacts including eight runtime modules (`aws`, `content`, `discovery`, `domain`, `handlers`, `http`, `rss`, `service`) and promoted locked dependencies; approve a replacement reviewed change set separately. Existing generated runtime/template files and the private architecture-review ZIP are preserved historical snapshots.

Before activation: separately approved synthetic managed-service validation, SES non-send API pacing and quota contention, delivered one-click headers, monitoring destination/incident owner, legal/consent/address/privacy, historical suppression/key/legacy-sender containment, content publishing and recovery exercises, payment continuity and then independent enrollment/delivery approval. Neither local implementation nor five false defaults prove deployed IAM or live operation. No live activation is authorized.

## Local verification result

Final results: **193/193** offline service tests passed; source/translated activation matrices **32/32**; SAM validation/lint and focused ESLint passed. See the [implementation result](newsletter-aws-independence-implementation-2026-10-25.md) and [file/verification inventory](newsletter-aws-independence-inventory-2026-10-25.json). Neither managed-service execution nor production restoration was performed.
