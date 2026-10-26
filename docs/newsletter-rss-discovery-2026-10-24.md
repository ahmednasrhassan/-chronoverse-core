# Public RSS and AWS weekly article discovery

24 October 2026. **PASS — local implementation and verification complete. No deployment or live activation is authorized by this report.** Local registration and delivery controls remain disabled.

## Verified baseline and preservation

- Branch `master`; HEAD remains `dea9254fb82b90076671d58e884dd58ba61eb1eb`. The substantial existing uncommitted newsletter rebuild and P0 work were preserved. No commit, push, deployment or destructive Git operation was performed.
- Before editing, 258 existing files were backed up and every ZIP entry was verified against its SHA-256. Evidence and recoverable snapshot: `.verification/newsletter-rss-discovery-20261024-143919Z/before.zip`, with `before-hashes.json` and `git-status-before.txt`. Existing backups under `E:\chronoverse-backups` remain untouched.
- Read the [Stockholm readiness report](newsletter-aws-stockholm-deployment-readiness-2026-10-24.md) and [completed confirmation safety report](newsletter-confirmation-safety-fix-2026-10-24.md). Confirmation persistence, confirmation/unsubscribe API handling, activation gates and confirmation tests remain unchanged.
- No actual subscriber records were accessed or modified. No email, AWS provisioning/configuration, Vercel/Sanity/DNS configuration change, secret operation or scientific article edit occurred. Public inspection used anonymous GETs for the existing feed and published `post` documents only.

## Existing feed and confirmed gaps

**Reuse `https://chronoversecapital.com/rss.xml`. It already exists in source and production.** No second feed was created; `/feed.xml` remains its existing permanent redirect.

Public observations at approximately 14:41–14:55 UTC:

| Check | Result |
| --- | --- |
| Production `/rss.xml` | HTTP 200; RSS 2.0; `application/rss+xml`; 30,255 bytes; 50 items with 50 unique links and publication dates |
| Production `/feed.xml` | Resolved to the same `/rss.xml` URL |
| Anonymous published-post query | HTTP 200; 71 posts with public IDs |
| Replacement rendered locally from those public posts | Valid RSS; 71 unique articles; 40,241 bytes; titles, original `publishedAt` timestamps and canonical URLs checked against the public source |

Production still serves the existing implementation. The 71-item replacement was verified locally, not deployed. Evidence: `public-feed-before.json`, `production-rss-before.xml`, `public-post-query-result.json`, `public-content-render.log` and `replacement-public-rss.xml` in the evidence directory.

| Source-confirmed problem | Cause and local correction |
| --- | --- |
| Rolling feed omitted older eligible content | GROQ had `[0...50]`. The same endpoint now exposes the complete eligible public archive, with explicit failure limits rather than silent truncation. |
| Article identity depended on its current URL | GUID was the permalink. New opaque GUIDs use the existing stable public CMS `_id`: `urn:chronoverse:article:<id>`. Canonical links remain separate. |
| Scheduled publication freshness depended on invalidation | `force-static` had no timed refresh. The feed now uses an anonymous fresh public query, dynamic execution and a successful-response edge cache of at most 300 seconds; errors return 503/no-store. Actual deployed CDN behavior still needs post-deployment verification. |
| Weekly overflow and missed periods could be lost | AWS selected eight items from only one seven-day window. It now retains a first-period boundary and durable pending article records, choosing up to ten oldest eligible items per issue. |
| Campaign-level idempotency did not prevent cross-issue article repeats | New article-ID and canonical-URL claims commit atomically with the immutable campaign. |
| Some invalid feed structures looked like empty weeks; titles could be altered | RSS/channel/GUID/date/link validation is now explicit. Invalid feeds stop planning. Titles remain the supplied factual title, including escaped angle brackets, without the former 180-character truncation. |

## Feed contract

The CMS query selects only `post` documents with defined slugs and publication dates at or before now, excluding draft and release-version documents. The XML builder additionally excludes invalid/missing metadata, future dates, unsafe/reserved root slugs, known retired/redirect-only roots and duplicate IDs/canonical URLs. It sorts by publication date descending, then ID and slug, independently of query result order.

The current content model has no separate retirement-status field. Unpublished/deleted posts disappear from the query; application-owned and retired redirect roots are excluded with the existing reserved-slug policy. No content schema or publishing workflow was changed.

Publication dates come from the existing authored `publishedAt`, at RSS second precision, never `_updatedAt` or a fabricated date. This does not reconstruct an earlier historical publication date if someone previously overwrote the CMS field. Descriptions use existing descriptions/excerpts/body text converted to plain text; XML escaping also removes invalid XML 1.0 characters. Sitemap, canonical metadata, article source, redirects and Sanity revalidation handlers are preserved.

The response is bounded to 5,000 source records and 2,000,000 XML bytes. Exceeding a limit returns an unavailable feed; it does not discard the oldest articles. Current public content is well below these limits.

## AWS discovery, backlog and retries

The existing path remains **EventBridge Scheduler → planner SQS → Lambda → public `/rss.xml`**. Schedule: Monday 09:00 UTC, independent of Stockholm/Cairo daylight-saving changes. No Vercel Cron, Sanity newsletter webhook, homepage scraping or manual article selection is used.

1. Existing exact runtime and durable delivery approvals are checked before discovery. All five infrastructure switches still default to false. Website signup stays code-paused; no `CONTROL`, subscriber or SES contact is seeded.
2. The first approved planner execution conditionally records `DISCOVERY.start` as the start of the preceding closed week, **before fetching**. An empty feed or first-fetch outage cannot move this boundary forward and lose that period. Earlier historical archive content is excluded from a clean launch.
3. Lambda fetches the fixed HTTPS feed without redirects, with a ten-second timeout and bounded streaming body. Non-200, wrong content type, invalid UTF-8/XML/RSS, entities/DTDs, missing/unsafe identities or links and invalid dates deny new issue creation. Future/current-open-period items wait for a later closed period.
4. Eligible dates are in `[DISCOVERY.start, current weekly boundary)`. Thus subsequent weeks include missed periods and overflow. Each discovered article has a retained `ARTICLE#sha256(guid)` row, initially `PENDING`, without TTL. Strong, batched reads handle every unprocessed key or fail closed.
5. Pending candidates must still occur in the current complete public feed. Removed/unpublished/retired content stays held in the ledger and cannot be resurrected from cached backlog. Current public titles/links are used; a changed original publication timestamp for an already recorded identity stops planning for review.
6. Up to ten oldest eligible candidates are frozen. One transaction creates the campaign, conditionally changes the selected article rows from `PENDING` to `ISSUED`, and creates `ARTICLE_URL#sha256(url)` claims. Excess remains pending for subsequent weeks. ID claims prevent repeats after slug changes; URL claims also cover previously used permalink GUIDs when the canonical URL is unchanged.
7. Concurrent planners and lost acknowledgements reuse the immutable campaign. New issue creation never falls back to cached backlog during a feed failure. Empty/no-new feeds create no campaign mail. Existing retries may reuse an already validated frozen issue without refetching or replacing its contents. Articles appearing after the weekly fetch, including delayed CMS/cache visibility, remain eligible for subsequent issues rather than being lost to a rolling seven-day cutoff.

`ISSUED` means assigned to one frozen issue, **not guaranteed delivery to every recipient**. Existing recipient claims, suppression checks, 72-hour campaign expiry and conservative handling of uncertain SES outcomes remain intact. The system does not automatically republish assigned articles to compensate for held/uncertain recipient delivery.

No table, index, queue, Lambda or scheduler resource was added. The planner gains only ledger-scoped `BatchGetItem` and `UpdateItem` permissions, limited to article/URL/campaign prefixes with a required, present `LeadingKeys` context. It gains no SES sending, scan, subscriber-update or deletion permission. Other IAM roles and all disabled defaults are unchanged. Atomic transaction and batched-read design follow [DynamoDB transaction semantics](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html) and [BatchGet consistency/retry requirements](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_BatchGetItem.html). Static validation does not establish effective live IAM permissions.

## Files changed in this task

Added:

- `services/newsletter/src/discovery.mjs`
- `services/newsletter/test/discovery.test.mjs`
- `src/lib/seo/tests/rss-discovery.test.ts`
- `docs/newsletter-rss-discovery-2026-10-24.md`

Modified:

- `src/app/rss.xml/route.ts`
- `src/lib/seo/rss.ts`
- `src/lib/seo/tests/rss-contract.test.ts`
- `src/lib/seo/tests/b8b-failure-and-indexing.test.ts`
- `src/lib/content/tests/editorialArtifacts.test.ts` — synthetic RSS fixture ID only
- `src/lib/content/tests/sanitization.test.ts` — synthetic RSS fixture ID only
- `services/newsletter/src/rss.mjs`
- `services/newsletter/src/service.mjs` — planner only, plus discovery import
- `services/newsletter/src/aws.mjs` — article batch reads and atomic issue persistence
- `services/newsletter/template.json` — scoped planner IAM addition only
- `services/newsletter/test/fixture.mjs`
- `services/newsletter/test/system.test.mjs`
- `services/newsletter/README.md`
- `docs/newsletter-aws-owner-guide-2026-10-24.md`

No files were deleted. This list describes this task's changes, not all pre-existing uncommitted work.

## Verification

| Check | Result |
| --- | --- |
| Backend regression suite | **84 passed**, including all 66 preceding tests and 18 new discovery/adapter tests |
| Website/components/SEO/newsletter routes | **83 passed** across 30 files, including seven new RSS tests and existing four newsletter route tests |
| Additional content/RSS sanitization regressions | **4 passed** |
| Real public content → local RSS → AWS parser | **71/71 verified**; no AWS call or subscriber read |
| Full ESLint | Pass; one existing `<img>` warning in `src/app/(site)/[slug]/page.tsx:413` |
| Final focused ESLint | Pass; no diagnostics on the 14 changed source/test files |
| Next type generation and TypeScript | Pass; two pre-existing synthetic fixtures were updated for required stable IDs after the initial typecheck identified them |
| Production build | Pass; 115/115 static pages, with `/rss.xml` correctly listed as dynamic |
| CloudFormation/SAM static validation | `cfn-lint` passed offline for **eu-north-1** |
| Syntax/infrastructure safety checks | Pass |
| Git whitespace/preservation checks | Pass; existing confirmation, safety, sitemap, webhook and configuration work preserved |

Coverage includes XML validity, source publication filtering, exact dates/titles/URLs, duplicate IDs/URLs, half-open weekly boundaries, year/month/DST transitions, backlog without starvation, initial outages, empty/unavailable feeds, partial DynamoDB reads, concurrent/cross-issue claims, lost acknowledgements, repeated runs, canonical slug changes and disabled controls. All automated subscriber/AWS fixtures are synthetic and network-blocked. Typecheck and build run in isolated copies without `.env` files; the build permits only exact anonymous public-content queries and compiler IPC. Build-only worker concurrency is capped without modifying the repository's Next configuration.

Evidence remains in `.verification/newsletter-rss-discovery-20261024-143919Z/`. SAM/AWS CLIs and a managed deployment were not exercised; offline schema/IAM linting and SDK mocks are not managed-service proof.

## Remaining approval and activation checks

1. **Deployment requires explicit owner approval.** Deploy the reviewed feed with signup still paused, and the reviewed Lambda/template through the existing disabled Stockholm change-set runbook. Neither action was performed. The current live feed remains capped at 50 until a website release.
2. Before enabling digest scheduling, verify the public deployed feed contract and actual Lambda egress/feed access, effective article-scoped IAM, transaction behavior and retained ledger recovery under separately approved isolated tests. No real email or subscriber access is authorized here.
3. Keep every existing activation prerequisite: private configuration, historical suppression/unsubscribe recovery, legacy sender containment and operational/compliance approval. Local code cannot stop old deployed sender versions. No legacy import is introduced.
4. Preserve the public GUID contract, canonical domain and retained discovery/article/URL/campaign/recipient records across hosting migrations and rollback. If CMS IDs are regenerated, carry the original feed identities through that migration; do not reset claims. Switching historical RSS GUIDs from URL to opaque IDs can cause a one-time rediscovery in external RSS readers. AWS's URL claims protect prior issue URLs; this does not claim to deduplicate mail sent by an unrelated historical system.
5. Monitor planner failures and archive growth before the explicit feed limits. Keep sending disabled during rollback; retain unsubscribe/feedback and all suppression/idempotency records. Do not restore the eight-item planner or truncated feed as an active sending rollback.

**PASS for local RSS/discovery implementation. Production activation remains NO-GO until deployment and outstanding managed-service/configuration approvals are completed.**
