# International English SEO and content release

Baseline: `bfef7077de3d092ed8ac7cce494ab55070d4c491`. The repository was clean,
and `master` matched `origin/master` before editing. Both public sites served the
software-platform release. The existing Gumroad storefront returned HTTP 200.
The Cookie and Refund Policy paths returned 404 before this release.

## Identity and search

- The site remains an English-language platform for original downloadable
  software, supported by articles on economics, finance and history. No product,
  operating system, launch date or commercial result is invented.
- The root title template uses the complete Chronoverse Capital brand once.
  Homepage and catalog titles describe their purpose. The catalog receives its
  own canonical, Open Graph URL and complete social metadata rather than
  inheriting homepage Twitter details.
- The shared social image now uses software-platform wording and the existing
  palette. A cached `/social-image` PNG is generated without external image
  requests. Dynamic article share cards retain their actual titles. The old
  static image is preserved for historical URLs but is no longer the default.
- Main and apps homepages have accurate Organization and WebSite JSON-LD.
  Each website has its own URL and identity; the publisher remains the same.
  No address, registration, award, opening date, rating, financial-service type,
  unimplemented search action or fictional SoftwareApplication is added.
- Visible breadcrumbs and matching BreadcrumbList JSON-LD connect informational
  pages, research categories and articles. Existing Article markup, source
  metadata, publication dates and HTML sanitization remain. Article markup now
  identifies the publisher consistently and declares English content.
- Nested article `main` elements are removed so the shared site layout supplies
  one main landmark. The homepage layout, palette, Geist and Geist Mono remain.

Implementation follows the installed Next.js metadata, ImageResponse and JSON-LD
guides, and Google's primary guidance for
[organization markup](https://developers.google.com/search/docs/appearance/structured-data/organization),
[site names](https://developers.google.com/search/docs/appearance/site-names) and
[indexing directives](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag).
These signals do not guarantee a particular ranking or search appearance.

## Page inventory and editorial decisions

| Page | Treatment |
| --- | --- |
| `/about` | Clarifies software focus, pre-launch scope, editorial role and separate storefront; retains founder and contributor profiles, removes active-trading-service language |
| `/contact` | Clear software/account/editorial/historical-order support instructions; removes awkward internal operational wording |
| `/privacy-policy` | Describes verified authentication, newsletter, hosting, analytics, local consent and external checkout boundaries |
| `/terms-of-service` | Updates factual service scope and purchase separation; preserves existing intellectual-property, historical-order and mandatory-rights boundaries |
| `/cookie-policy` | New factual browser-storage explanation, consent scope and reset instructions; no new tracking |
| `/refund-policy` | New purchase/refund information page; preserves original order terms and gives a support path without promising refunds or creating a software license |
| `/faq` | Explains intended tools, unconfirmed first product, editorial role, free browsing and future eligible Gumroad purchases |
| `/disclaimer` | Describes educational articles and pre-launch software; removes retired output/classification wording |
| `/editorial-policy` | Existing accurate sourcing, visual integrity, assisted-tool and correction standards preserved; breadcrumbs added |
| `/methodology`, `/data-sources`, `/freshness` | Existing evidence and date guidance preserved; breadcrumbs added |
| `/dmca` | Existing copyright notice process preserved; breadcrumbs added; no claim of registered designated-agent status |
| `/manifesto` | Clear software/research operating principles, its own metadata, retained noindex |
| `/archive` | Bounded Sanity pagination retained; self-canonical pages with normalized page numbers, noindex/follow |
| `/account`, `/studio`, `/auth/*` | Existing identity and private boundaries retained; account receives its own metadata and stays noindex/nofollow |
| `/reports`, categories, articles, `/newsletter`, `/rss.xml` | Existing publishing and valid URLs retained; research/category/article breadcrumbs improve discovery |
| Apps catalog and future detail routes | Truthful empty registry retained; catalog/storefront distinction added; no product checkout links or payment integration |

## Sitemap, robots and links

The primary sitemap includes the two new informational policy pages, published
articles and populated categories. It excludes account, archive, manifesto,
studio and retired products. The apps sitemap remains on its own host and
contains only its root while the registry is empty. No current-time dates are
fabricated for static pages or old articles.

The main robots policy continues to protect private/API crawl boundaries while
explicitly permitting the public article-image relay and share-image endpoint.
This fixes image discovery without exposing private API routes. Robots rules are
not authentication. Preview hosts retain noindex headers; retired membership
pages remain 404 and removed billing/webhook APIs remain 410. The known main-site
informational links on the apps host redirect to their main-domain owners.

The catalog search remains client-side and does not generate indexable result
pages. Canonicals omit tracking and search parameters. Archive pagination is
intentionally noindex, with each normalized page retaining its own identity.
Only English content is served; no fictitious translated or country pages and
no unsupported hreflang variants are introduced.

## Verified data-processing behavior

- `chrono_cookie_consent` and `cookie_consent` are localStorage entries, saved per
  origin with no application-set expiry. They are not described as cookies.
- Analytics loads only after consent, only on the main host, excluding auth,
  API, studio and framework paths. Advertising storage stays denied.
- Supabase SSR authentication manages session/verification cookies. No account
  is required to browse the catalog or read articles.
- Newsletter signup stores normalized email, signup time, active state and source
  in Sanity. Signup itself does not send email. A protected workflow uses SES.
- Contact uses an email link. Public comment submission and the legacy email
  endpoint are disabled. Historical financial records are untouched.
- Gumroad has its own website, checkout and privacy practices. Existing DNS,
  Vercel domain configuration and storefront settings are not changed.

## Owner and legal review still required

No unapproved refund promise, software license, warranty, support deadline,
governing jurisdiction, compliance certification or new contractual commitment
is published. Historical purchase rights and original receipt terms remain.

Before any software sale, the owner should confirm the product's Gumroad
eligibility and verified URL, seller/operator legal identity, applicable
jurisdictions, product license, refund rules, support/update commitments and any
mandatory consumer disclosures. Retention schedules, processing regions,
provider agreements, applicable privacy rights and consent-control adequacy also
need owner/legal assessment; this code review cannot verify them. Existing
contributor affiliations/roles and copyright agent requirements should be
reconfirmed. No registration, location or regulatory status is invented.

The existing Gumroad storefront has its own search/social description, outside
this repository. The owner may wish to align it with the new positioning; this
release does not edit its settings.

## Verification

The interrupted session had completed the content and SEO implementation, lint
and type checks. Its regression run stopped on outdated FAQ wording assertions;
the production build and final HTTP/browser checks had not run. Resuming preserved
the existing working tree and updated the FAQ/operating-principle assertions to
check the current software positioning while retaining the legal/security checks.

Detailed local evidence is retained under `.verification/seo/` (ignored).
Production verification is deferred: this continuation does not authorize a
commit, push or deployment. No dependency, production secret, database record,
historical migration, DNS or Docker change is included.

### Newsletter signup

The existing forms POST to `/api/newsletter`, which validates and normalizes the
email and awaits Sanity persistence. The forms require both a successful HTTP
response and `status: "success"` before showing confirmation. Signup does not send
email; protected SES dispatch is a separate workflow.

An isolated regression reproduced a persistence bug: a lookup can miss an
existing deterministic subscriber ID, after which `createIfNotExists` returns
the existing inactive document unchanged. The route previously reported success
without reactivating it. It now checks the returned document and awaits any
required reactivation before confirming success. Existing legacy IDs and active
duplicates keep their current behavior; no subscriber migration is performed.

Raw provider error messages are no longer logged because they can contain email
addresses or request credentials. Clients continue to receive a generic 503 on
persistence/configuration failures.

Tests call the real API handler with isolated SDK fixtures and exercise both
rendered React forms with a local DOM. They cover delayed persistence, normalized
addresses, active duplicates, inactive legacy records, stale lookups, read/create/
reactivation failures, missing credentials, malformed/oversized input, loading
state, duplicate clicks, invalid responses, service errors and network failures.
All test fixtures are offline; no production subscriber was created or changed.
This establishes the reproduced code defect and its fix, not a diagnosis of an
unobserved production click or live provider permissions/delivery.

### Completed local checks

| Check | Result |
| --- | --- |
| Lint | Exit 0; the existing article `<img>` warning remains; no errors or disabled rules |
| Type checks | `npm run typecheck` passed; production-build TypeScript validation also passed |
| Regression tests | 133 passed in the latest groups: safety 10, auth 21, public 73, content 29; no failures, skips or cancellations |
| Production build | `npm run build` exited 0; 114 static pages; tracked Next configuration unchanged |
| Built-server route checks | 230 passed, including a real published article, RSS, hosts, redirects, auth and retirement boundaries |
| API boundaries | Six existing checks passed; an additional valid signup with local write credentials disabled returned 503/error as expected |
| Generated SEO | 77 sitemap entries plus the apps root checked; 78 pages and 83 internal links passed canonical, metadata, language, headings, landmarks and JSON-LD checks |
| Share image | Valid 1200 x 630 PNG, 52,574 bytes; visually reviewed |
| Responsive browser checks | 50 page/viewport combinations passed at 360, 390, 768, 1024 and 1440px; no overflow or page errors; mobile menus, keyboard focus and catalog search passed |
| Security audit | `npm audit --json` exited 1: zero Critical/High and four unchanged Moderate entries in the Sanity CLI/typeid/uuid chain |
| Runtime exposure | All 53 production traces checked; none includes the affected CLI/typeid chain |
| Diff review | `git diff --check` passed; dependencies, Next configuration and historical migrations unchanged |

The original full regression run passed 122 tests. After adding the form tests,
the public group was rerun and passed all 73 tests, bringing the verified total
across the latest groups to 133. The new API regressions failed before the fix
and passed after it. The offline runner strips service credentials, blocks
networking and prevents environment-file reads.

One category intentionally uses its factual title when no authored description
exists. The HTTP verifier was corrected to require a nonempty description
instead of imposing an arbitrary minimum length, preserving the established
category contract. A fuller authored description can be added editorially later.

The connected browser was unavailable. Responsive and performance checks used
the existing local headless Edge test setup, with screenshots reviewed for the
new policy pages, catalog and social image. At 390px and 4x CPU throttling, local
home/catalog observations were LCP 1,136/1,572ms and CLS 0/0.000041. These are
local smoke measurements, not field Core Web Vitals, device benchmarks or INP
validation.

The working tree remains on `master` at
`bfef7077de3d092ed8ac7cce494ab55070d4c491`, with 46 modified tracked files and 11
untracked entries, nothing staged and no deletions. No commit, push, deployment,
production data mutation or live email dispatch was performed. The owner/legal
review items above and live persistence/delivery verification remain outstanding.

Search Console sitemap submission, URL inspection, ongoing field Core Web Vitals
and international search performance should be monitored after indexing catches
up. No Search Console ownership or CrUX field dataset is assumed, and local
browser measurements are not reported as field Core Web Vitals.

## Approved newsletter and identity follow-up

The preceding validation table and 46-modified/11-untracked inventory describe
the earlier resumed checkpoint. The subsequent read-only review identified the
private subscriber authentication defect, missing unsubscribe/feedback handling,
delivery completion/retry risks and an unsupported dispatch footer. The owner
authorized a narrow implementation follow-up while retaining release NO-GO.

The owner has now expressly rejected the US-LLC identity and the former postal
address. The active footer claim has been removed. The brand remains Chronoverse
Capital, with no invented legal operator, address or registration. A complete
repository search found no further active incorporation/address claims; only
negative regression checks and documentation of the owner's correction match
the former place/entity keywords.

The implementation and exact pending owner decisions are recorded in
[the newsletter release checklist](newsletter-release-checklist.md), including
dedicated authenticated server-only storage clients, immutable campaign/audience
snapshots, conditional recipient claims, bounded safe retries, ambiguous-outcome
holds, durable opt-out/complaint/bounce suppression, signed SNS feedback and a
default-closed send gate. Signup confirmation still requires successful storage.
Public signup cannot clear a suppression, and SES acceptance is not presented as
inbox delivery. No provider service, queue or dependency was added.

The dynamic Open Graph title now preserves Unicode boundaries and the ellipsis.
Response buffering catches asynchronous render failures before returning, with
a minimal brand card and local PNG as fallbacks. Node supports the local-file
fallback and follows the installed Next runtime guidance (Edge is deprecated).
The earlier fallback removal is corrected without reverting the shared image
design or completed metadata improvements.

The four Moderate audit entries are explicitly accepted by the owner as
temporary residual tooling risk. They propagate one UUID advisory through
Sanity/CLI/TypeID; dependencies, overrides and lockfiles remain unchanged.

The latest offline regression groups pass 153 tests: safety 10, auth 21, public
75 and content 47. They include real signup/unsubscribe/feedback/cron/publication
handlers, isolated in-memory storage, cryptographic synthetic SNS events and
mocked SES, with Node networking/service credentials blocked. They do not prove
actual Sanity role scoping or managed persistence, real SNS routing, SES sender
configuration or inbox delivery. The explicit nonproduction verification
procedure and remaining release blockers are in the checklist. No live or
simulator email, production subscriber access/change, production configuration
change, commit, push or deployment is authorized or performed by this follow-up.

### Follow-up validation and final inventory

| Check | Latest result |
| --- | --- |
| Lint | Passed, zero errors; only the existing article native-image warning at `src/app/(site)/[slug]/page.tsx:413` (same image exists at baseline line 401). The final signup annotation also received a focused lint check. |
| Typecheck | Passed after the final source changes; production-build TypeScript validation also passed. |
| Automated tests | 153 passed across the latest isolated groups: safety 10, auth 21, public 75, content 47; no failures/skips/cancellations. The full run passed 151 before two additional edge-case regressions; the final content group includes both and passes 47. |
| Production build | Exit 0, Next 16.4.2, 116 static pages generated. No temporary Next configuration edits. |
| Built-server routes | 230 passed, retaining main/apps/newsletter host behavior and protected/retired boundaries. |
| Built SEO | 77 sitemap entries plus apps root: 78 pages and 83 internal links passed; default PNG valid at 1200 x 630. |
| API checks | Six existing ingress checks passed; six additional configured-off newsletter boundaries passed, including valid synthetic signup returning 503 and no success/data exposure. |
| Dynamic OG | Long-title PNG valid at 1200 x 630, 80,016 bytes; visually reviewed with the ellipsis. Render/stream/final-file fallback behavior is covered offline. Local fallback logo is included in the production trace. |
| Responsive browser | 50 combinations across 10 pages and 360/390/768/1024/1440px passed: no overflow/page errors, navigation keyboard/focus and catalog search passed. Existing local headless Edge harness; previous evidence preserved under separate filenames. |
| Audit | Fresh `npm audit --json` exits 1 with four Moderate entries, zero High/Critical. Explicitly accepted temporary tooling risk; no upgrades/downgrades/overrides applied. |
| Exposure | All 55 server traces exclude the CLI/TypeID chain. Client-bundle scan found no newsletter private-client/token-name/fixture code. |
| Repository | Normal `git diff --check` passed. Dependencies, lockfile, Next configuration, historical migrations and HEAD unchanged. No staged changes or deleted files. |

An initial parallel HTTP run encountered a connection reset; the sequential SEO
rerun passed completely. The unsubscribe HTTP verifier initially assumed its
route-level Referrer-Policy would override the existing global Next header.
The global `origin-when-cross-origin` policy is retained; it excludes the opaque
query from cross-origin referrals. The confirmation HTML additionally specifies
`no-referrer`, and the endpoint's restrictive CSP, no-store and noindex headers
were verified. No global security configuration was weakened or changed to make
that verification assumption pass.

Final Git inventory: `master`, HEAD
`bfef7077de3d092ed8ac7cce494ab55070d4c491`; 50 modified tracked files and 21
untracked status entries (28 individual untracked files). The original content,
SEO/admin/account changes remain; additions are the scoped newsletter modules,
endpoints, focused tests, OG fallback helper and release documentation. All 78
changed/new files were inventoried; no unrelated additions, exposed credential
patterns or generated artifacts were identified among them. `.verification/`,
`.next/` and dependencies remain outside the commit inventory. Source hashes
were retained to check that validation did not alter implementation files.

Release remains **NO-GO**. The checklist's operator/address/sender, legal and
business statements, privacy/cookie/date/consent, legacy opt-out/privacy,
scoped-storage permissions, SES/SNS configuration and managed-service validation
decisions remain pending. The revised send gate is closed by default, but the
existing production deployment has not been changed, inspected for pause state
or deployed with these changes. No assertion is made that source edits alone
pause an older live deployment. The isolated verification server was stopped;
no real/simulator email or production subscriber access/write occurred.

## Local signup pause: 24 October 2026

The owner subsequently approved temporarily pausing new signup. Both public
signup presentations now show a professional pause notice and research link;
newsletter metadata, the homepage and FAQ no longer invite signup during the
pause. Privacy wording distinguishes the pause from retained subscriber records
and preserved opt-out handling. Policy dates were not changed.

The public signup API rejects all POSTs with an explicit uncached 503/paused
response before parsing an address or accessing storage. The prior signup
implementation is preserved in a server-only helper and remains covered by its
isolated tests for future reactivation. A shared code-level pause controls UI
and API; no environment setting can reopen signup. Unsubscribe/suppression and
all delivery gates are preserved, with new tests exercising both dispatch
routes against each false confirmation gate. No auth, transactional mail,
contact, schedule, provider configuration or production data change is included.

### Signup-pause validation

| Check | Result |
| --- | --- |
| Lint | Exit 0, no errors; the same pre-existing article `<img>` warning remains. |
| Typecheck | Exit 0; build TypeScript validation also passed. |
| Production build | Exit 0, Next 16.4.2; existing Next configuration retained. |
| Latest isolated automated groups | 152 passed: safety 10, authentication 21, public 72, content 49; no failures, skips or cancellations in the latest groups. The initial public run exposed a missing JSDOM browser global and the obsolete active-signup metadata expectation; these test fixtures/expectations were corrected and the public group rerun successfully. |
| Signup/data boundary | Synthetic new, inactive, active and suppressed addresses all return 503/paused through the public route, without consuming their bodies or making a storage call; fixture records stay identical. Retained registration and real unsubscribe/suppression regressions still pass offline. |
| Delivery boundary | Both real dispatch routes return 503 before storage/SES when each of the four confirmation gates is independently false; mock transport receives zero calls. |
| Built HTTP | 16 local checks passed: valid/malformed/oversized signup POSTs, unsupported methods, disabled dispatch/feedback/opt-out configuration, relevant page copy and the existing newsletter canonical redirect. |
| Browser | 12 checks across newsletter, home, FAQ and privacy at 360/768/1440px passed; no overflow/page errors or signup requests. Both unit-rendered public surfaces have no signup form/input/submit control. Mobile screenshot visually reviewed. |
| Preservation | Hash comparison confirms existing dispatch, proxy, unsubscribe, suppression, feedback and transport code is unchanged from the approved follow-up. Dependencies, Next config, cron schedule and authentication implementation are unchanged. |
| Git | `master`, unchanged HEAD `bfef707`; 54 modified tracked files and 23 untracked status entries (31 individual untracked files); nothing staged. |

The prior unpaused form's duplicate page cases were replaced by paused public
server/browser rendering checks, while the reusable active form's five feedback
cases and all retained backend registration regressions remain tested. Detailed
local evidence is under `.verification/seo/signup-pause-*` (ignored). The test
server used empty newsletter storage credentials and explicitly false send
gates, and was stopped after verification. An initial HTTP/browser verifier
assumed the FAQ repeated the whole notice; it now checks the FAQ's accurate
"view newsletter status" link and verifies the notice itself on the landing page.

No new implementation blocker remains. Website owner/legal confirmations and
verified production sending-pause evidence remain required for release; the
separate marketing compliance, provider-permission and managed-service checks
remain open. The previously accepted Moderate dependency findings are not fixed
by this scope, and dependencies were not changed. No production variables, IAM,
firewall, cron schedules, Sanity webhooks, subscriber records, live/simulator
mail, staging, commit, push or deployment were changed or executed.
