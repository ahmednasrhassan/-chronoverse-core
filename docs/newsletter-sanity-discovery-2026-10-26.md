# Automatic Sanity publication discovery ? local implementation

**Historical implementation snapshot:** the creation-date restriction and conditional Lambda failure-destination permission described below are superseded by [the publication-date correction](newsletter-sanity-publication-date-fix-2026-10-26.md). Read that report before preparing or reviewing a release. Earlier artifacts remain preserved.

IMPLEMENTED LOCALLY. No deployment, activation, live Sanity/AWS query, upload, email, subscriber operation or Git mutation. Production execution and recovery remain UNVERIFIED. The old CloudFormation Change Set must never be executed or modified for this revision.

## Verified repository source

| Fact | Exact local evidence |
| --- | --- |
| Article type and fields | `src/sanity/schemaTypes/post.ts`: `post`; required title and `slug.current`; optional/editable `publishedAt` is labelled ?Published At (Schedule)?; optional seoDescription/excerpt/body. No newsletter eligibility or additional editorial approval field exists. |
| Stable identity and revisions | Existing RSS uses `_id` as `urn:chronoverse:article:<_id>` (`src/lib/seo/rss.ts`). Installed primary SDK `node_modules/@sanity/client/src/types.ts` defines `_id`, `_rev`, `_createdAt`, `_updatedAt`. Revisions are opaque; they are not sorted lexically. |
| Published eligibility | `src/app/rss.xml/route.ts` explicitly excludes `drafts.**` and `versions.**`, requires publishedAt <= now(), and selects public post metadata. `src/lib/content.ts` has the site's published-post filter. |
| Publish action | `src/app/studio/[[...index]]/page.tsx` retains `...prev` native actions; custom actions add SEO/open/copy actions. No immutable original-publication or human approval attestation is supplied by this workflow. Published documents can also be written by other authorized Sanity clients; this integration does not identify the person who published. |
| Canonical reference | `src/config/siteConfig.ts` declares https://chronoversecapital.com; `src/lib/seo/site-url.ts` constructs /<slug>. Poller uses a separately configured ArticleOrigin and the existing root-slug grammar/reservations; it never fetches that website. |
| Source project/dataset | `src/sanity/client.ts`: defaults xfs4j01p / production / API 2024-03-01, client without token, freshClient without CDN. Environment may override these website defaults. New discovery parameters deliberately default empty, so the actual production namespace must be confirmed once during deployment. |
| Current publication webhook | `src/app/api/webhook/sanity/route.ts` returns 410; it does not dispatch the Newsletter. No webhook is required or registered by this implementation. |

Tokenless read-only public Content API access is supported by the existing client/query design. Actual dataset visibility, access policy, public rate limits and billing were NOT queried; 401/403 is a failed scan, never empty success. No token/private-data fallback was added. No Sanity schema or Studio code changed.

## Implemented automatic flow

EventBridge Scheduler ? isolated discovery Lambda ? HTTPS GET of the official non-CDN published Content API ? exact private versioned S3 manifest ? existing planner ? existing recipient workers/SES. Weekly execution imports no live Sanity client/query code and contacts no website/RSS/Vercel/Next.js service.

`services/newsletter/discovery-template.json` is an explicitly separate companion: six resources (one Lambda, two scoped IAM roles, one log group, one Scheduler, one Lambda async retry/destination configuration). It reuses the main stack's ledger and failure queue and the existing S3 bucket. No new service family, database, bucket, secret, API, public endpoint, server, NAT, custom metric, GitHub automation or CMS is added. Separating the publisher preserves the mail stack's original security assertions: 38 authored resources/five functions, no S3 write/list/delete permissions and no ingestion API. Existing mail roles receive no new permissions.

Discovery is daily **09:00 UTC**. The existing weekly enqueue moves to **Monday 09:10 UTC**; its article/consent window remains Monday 09:00 UTC. Source eligibility is checked after that boundary, before selecting/enqueuing and before each recipient claim, and checked again in the real SES adapter immediately before handoff. These checks read only strongly consistent AWS ledger state. A failed/in-progress poll, a snapshot older than **one hour**, a pre-boundary snapshot, a revoked policy, unpublication, changed canonical/provenance/revision or concurrent checkpoint change holds delivery. A final explicit no-send eligibility failure uses the existing safe deferral mechanism; uncertain SES outcomes remain held by the original safeguards.

## Publication evidence, dates and safety

One-time durable `CONTROL.contentSourceApproved=true`, real numeric UTC-millisecond `contentStartAt`, and `sanityPublishedStateApproved=true` are REQUIRED and never seeded. Existing delivery/legacy/compliance approvals remain required independently. `approvedBy=sanity-published-state-v1` identifies this source policy, not a human. Article approval time is the later of the real published revision `_updatedAt` and declared scheduled `publishedAt`; AWS observation time is stored separately. Root approval/freshness time is the actual successful scan observation. Source ID includes the exact project/dataset/document ID; the evidence digest hashes the returned source fields with that namespace. This is a recorded TLS-authenticated source observation, not a Sanity-signed human approval or historical revision attestation.

The first observed original publication/creation dates remain fixed. Subsequent date rewrites, revision rollback and conflicting content under the same revision fail closed. Original publishedAt is normalized to canonical UTC ISO without changing its instant. Canonical root slugs and plain bounded email summaries are validated.

To prevent historical replay, both declared publication and source creation must be on/after the real cutover. **Pre-cutover drafts later published are deliberately excluded**: supporting them with reliable original first-publication provenance would require a separately approved immutable publishing metadata/workflow change. No historical source dates are invented or imported. The earliest discovery boundary uses the approved cutover/weekly floor only when this policy is explicitly approved; an already-existing DISCOVERY row is never reset backwards.

Each scan uses two identical bounded, complete cursor-paginated reads with totals and explicit draft/preview exclusions. This detects incomplete pages and observed concurrent source changes; it is not a transaction across the upstream service. At most 80 examined documents, 40 retained publications, 512 KB/page, 20 documents/page, three HTTP attempts/page, <=2-second retry delays, 7-second HTTP deadlines and a shared 90-second query budget. Lambda is capped at 120 seconds/256 MB. 429, timeouts and selected transient failures retry; exhausted, invalid or inconsistent scans fail. Empty is accepted only after two complete successful reads.

The catch-up horizon is **35 days**. A longer checkpoint gap stops explicitly, without advancing or importing old content. Expired *source snapshots* can be examined solely for reconciliation and refreshed after a successful current-source scan; the delivery parser still rejects expired manifests. Publication approval timestamps are not renewed on unchanged revisions. Daily root refresh prevents seven-day expiry from losing an article published just after the previous weekly send; Sunday-before-boundary publications first seen Monday use authentic source revision timing.

Unpublication/deletion or lost eligibility produces a permanent article tombstone before new delivery can be permitted. Republishing the same identity never silently resurrects it. New revisions retain identity, so the existing article/canonical and recipient ledgers prevent reissuing the article as new. A changed/revoked revision in a frozen issue holds that issue; campaigns/accepted deliveries are not rewritten, unlocked or replayed.

Aged publications leave the rolling manifest only after their existing ARTICLE ledger says ISSUED and its assigned campaign has expired (72 hours). Their journal/dedup history remains. Unassigned aged backlog raises `publication_backlog_expired`; it is not silently dropped. The offline 45-day test demonstrates operation beyond 40 lifetime publications. More than 40 current retained publications is an explicit capacity hold requiring review, not truncation.

## Persistence, permissions and recovery

A conditional DynamoDB lease marks eligibility CHECKING before source access. Per-article conditional journal versions preserve identity and irrevocable tombstones. S3 requires enabled versioning, expected bucket owner, exact Stockholm endpoint, TLS, bounded JSON, and explicit AES256 encryption on PUT. Initial writes use If-None-Match:*; updates require the prior exact ETag with If-Match. 409/412 never becomes a blind overwrite. No ListBucket, DeleteObject, public write or arbitrary S3 destination exists. A bootstrap 403 only permits a create-if-absent attempt, never overwrite authorization.

The successful discovery checkpoint advances only AFTER an acknowledged versioned S3 write. A lost acknowledgement or later ledger failure leaves delivery paused; the next complete scan reads the current S3 version, preserves journal identity/tombstones and safely publishes the next sequence. Old leases cannot commit over a new owner; conditional S3 writes cannot replace a newer object. The reader's existing CONTENT#STATE anti-rollback checkpoint and frozen campaign protections remain intact.

Discovery IAM: GetItem only CONTROL/PUBLICATION#*/ARTICLE#*; PutItem only PUBLICATION#*/DISCOVERY on the existing dedicated table; exact-object GetObject and encrypted PutObject; same-account GetBucketVersioning for the chosen bucket; exact log stream permissions and existing failure-queue SendMessage for async failures. No subscriber/audit/mail keys, table scan/query/delete, secret reads, SES permissions or management API. Scheduler can invoke only that Lambda and send its own failure to the same existing queue. All access grants/scheduling are gated by source configuration plus DeliveryEnabled/LegacyDispatchRetired/ComplianceApproved. All five activation defaults remain STRING false in BOTH templates; source parameters remain empty. No runtime activation occurred.

The existing encrypted backup tool is unchanged; its documented full-table raw AttributeValue capture preserves new ledger rows as well (`tools/newsletter-backup/README.md`). Recovery must preserve PUBLICATION tombstones/leases/checkpoints, DISCOVERY/article/recipient claims, suppression/nonces and S3 version history together. No managed restore was performed. Never reset these records or fall back to an older archive just to resume mail.

## Required one-time configuration ? not performed

- Main stack and companion: eu-north-1; ContentBucket=chronoverse-nl-artifacts-957261948953-eun1; ContentManifestKey=newsletter-content/approved.json. Existing bucket versioning/initially empty prefix are founder-confirmed, not newly queried. Confirm encryption, expected owner, prefix writer isolation and retained versions during separately approved preflight.
- Companion: ExistingLedgerName from the main stack LedgerName output, its actual FailureQueueArn, SanityProjectId=xfs4j01p and SanityDataset=production IF those fallback values match the approved production namespace; ArticleOrigin=https://chronoversecapital.com. No Sanity token, webhook registration or private CMS credential is needed.
- Main PublicOrigin stays empty until its API endpoint is separately deployed/verified. No DNS or API origin was invented. The new ArticleOrigin parameter is a canonical reference, not the subscriber-management origin.
- All five activation parameters remain false. Future policy/cutover, infrastructure deployment and sending/registration activation require separate founder approval; code preparation authorizes none of them.

## Local test evidence and limits

Saved evidence: `.verification/newsletter-sanity-discovery-20261026/`. **242/242 passed: all 193 pre-existing cases plus 49 added; no failures/skips/cancellations.** `newsletter-tests-accepted.log` and `accepted-results.json` hold the final runs. `translation-results.json`/`activation-matrices.json` record both source and translated 32-combination checks for main and companion; both SAM templates and their translated forms passed lint. Final tests/results, syntax checks, focused ESLint, SAM lint, translated lint and source/translated 32-combination matrices are recorded there. Original test files/assertions are byte-identical to the before snapshot. Tests use synthetic documents, fake clocks and mocked transports only; Node networking/env/private-auth guards and Python AWS/socket guards are enforced. An intermediate new test had an incorrect fixture construction; its failure log is retained, and the loader was configured before creating the service. No original assertion was removed.

The final inventory provides exact changed paths, hashes and final counts. This is offline behavior/configuration evidence, not managed ARM64/IAM/S3/SES, live Content API, account quota or restoration verification. Daily observation is not instant source revocation: changes after a completed poll can remain unobserved until the next poll; sends are restricted to its one-hour freshness window. Long outages/expired capacity can hold or skip an issue and enter existing DLQ handling. Existing uncertain deliveries are never auto-redriven. Do not claim guaranteed issue delivery, immediate unpublish detection, or unlimited catch-up.

## Incremental cost model

Reuse the saved 2026-10-24 Stockholm rate evidence, not a fresh price/account query. Model 30 enabled daily runs, 256 MB at 20 seconds, <=40 active public records, a 20?60 KB manifest, <=1 MB additional logs/month and <=1,000 weekly subscribers with <=10 articles/issue:

| Additional usage/month | Estimate |
| --- | --- |
| Lambda | 30 invocations; about 150 GB-seconds ingestion duration, plus extra worker ledger-read duration (not measured in AWS) |
| Sanity Content API | Normally 60?120 tokenless GETs; up to 240 pagination calls before retries at the scan bound; plan/API/egress charges unverified |
| S3 | About 60 GET/metadata reads and 30 conditional PUTs; 30 retained versions add roughly 0.6?1.8 MB/month, cumulatively |
| Scheduler | 30 target operations, plus bounded failure retries |
| DynamoDB | Roughly 1,500?3,000 discovery reads/writes before size multipliers/retries; up to about 113,000 extra strong reads/month at 1,000 weekly recipients for two ten-article eligibility checks |
| CloudWatch | One new 14-day log group; existing regional Lambda alarms cover the new function; no additional custom metric/alarm subscription |

Saved rates: ARM $0.0000133334/GB-second, Lambda $0.20/million requests, DDB $0.1345/million RRUs and $0.67/million WRUs, S3 PUT $0.005/1,000 and GET $0.0004/1,000, S3 $0.023/GB-month, log ingest $0.54/GB, Scheduler modeled $1/million operations. Indicative incremental AWS usage is approximately **$0.01?$0.05/month** with these assumptions, BEFORE allowances/credits/tax and excluding unverified Sanity plan costs. The previous 1,000-subscriber model ($2.82?$3.10) becomes approximately $2.83?$3.15. Approximately $4 remains plausible at low volumes, not guaranteed. Faults, larger items, slower execution, unlimited version history, other workloads, paid SES/KMS/add-ons or source billing can change it. No new fixed-fee service is introduced.

## Release and production status

The validated artifacts under `E:\cv-nl-independent-disabled-20261026-003212` remain unchanged historical snapshots and are **SUPERSEDED for this automatic-source implementation**. They lack the publication modules/guards and companion configuration; do not deploy them as this revision. Fresh authorized runtime ZIP/main release template AND companion release template must be generated/reviewed together later. No build/packaging/deployment was performed here.

Remaining production gates: private code/parameter/IAM review; actual tokenless project/dataset access and source limits; one-time genuine policy/cutover approval; existing bucket/table/queue linkage and ownership/encryption; fresh artifacts/new separately reviewed Change Sets; verified API origin and old unsubscribe URL continuity; managed ARM64/conditional-write/concurrency/SES pacing and quota tests, monitoring/compliance/payment continuity and coordinated recovery. No source schema change is needed for the conservative post-cutover eligible path; extending eligibility to older drafts requires reliable immutable first-publication metadata and explicit approval. STOP at this local implementation.

## Exact local file delta

- Modified: `services/newsletter/src/service.mjs` ? Validate AWS publication eligibility before planning/claiming, preserve approved first-cutover catch-up, and carry final eligibility context.
- Modified: `services/newsletter/src/aws.mjs` ? Recheck publication eligibility immediately before the existing SES handoff, using existing ledger read permissions.
- Modified: `services/newsletter/template.json` ? Move weekly enqueue to Monday 09:10 UTC, retaining the Monday 09:00 article/consent boundary and all original role/resource/activation assertions.
- Modified: `services/newsletter/README.md` ? Link the current automatic-source contract and mark old release snapshots superseded.
- Added: `services/newsletter/src/publication.mjs` ? AWS-only source-policy freshness, revision, unpublication and concurrent-check guards; safe pre-send deferral.
- Added: `services/newsletter/src/sanity-discovery.mjs` ? Bounded tokenless published-source scans, catch-up, provenance, stable identities, retirement/tombstones and conditional manifest publication workflow.
- Added: `services/newsletter/src/publication-aws.mjs` ? Narrow conditional DynamoDB and signed exact-object S3/versioning adapters.
- Added: `services/newsletter/src/discovery-handler.mjs` ? Private scheduled discovery Lambda entry point with bounded public queries and aggregate-only logs.
- Added: `services/newsletter/discovery-template.json` ? Isolated disabled companion using existing ledger, S3 object and failure queue; no public API, secret or mail privileges.
- Added: `services/newsletter/test/sanity-discovery.test.mjs` ? Synthetic discovery, timing, outage, persistence, concurrency and long-running rolling-manifest regressions.
- Added: `services/newsletter/test/publication.test.mjs` ? AWS-only send eligibility, revoked snapshots, exact SDK/IAM behavior and companion activation matrix coverage.
- Added: `docs/newsletter-sanity-discovery-2026-10-26.md` ? Verified Sanity fields, implementation/security/configuration, boundaries, cost model and production limitations.
- Added: `docs/newsletter-sanity-discovery-inventory-2026-10-26.json` ? Exact task delta, source hashes and validation/preservation records.

The future shared runtime ZIP allowlist must include all twelve runtime modules: aws, content, discovery, domain, handlers, http, rss, service, publication, sanity-discovery, publication-aws, discovery-handler. Migration/helpers/tests remain outside the deployable runtime.
