# Chronoverse Capital: post-release quality audit

Date: 24 October 2026 (Africa/Cairo). **Read-only audit; fixes await owner approval.**

## Decision summary

The deployed release is the expected commit and its public route/asset baseline is healthy. All **89 URLs in the main sitemap returned HTTP 200**, including **71 articles**, 16 static pages and two populated categories. The apps catalog, its robots/sitemap, the account shell and the linked Gumroad storefront were reachable. No unexpected public-page 404 or 500 was found in the crawl.

The highest priorities are restoring unsubscribe availability while maintaining an independent delivery stop, resolving the OGAS article/content mismatch, and correcting the article math and audio pipelines. **There is no evidence from this audit that newsletters were sent, subscriber records leaked, or access controls were bypassed. There is also insufficient production access to certify that every historical sending path is disabled.**

| ID | Priority | Finding | Evidence classification |
| --- | --- | --- | --- |
| A01 | P0 | Unsubscribe fails before token validation | Confirmed production response and source guard |
| A02 | P0 | Signup pause does not enforce delivery suspension | Confirmed code architecture; actual sending/configuration unverified |
| A03 | P1 | OGAS URL/title/description serve a South Sea Bubble body | Confirmed public content mismatch |
| A04 | P1 | Dollar amounts are parsed as inline mathematics | Confirmed source replay using captured production text; browser appearance unverified |
| A05 | P1 | Five “Full Briefing” audio controls receive only the title | Confirmed production serialized props and source; audible playback unverified |
| A06 | P2 | Bonds article has another article’s description | Confirmed production metadata |
| A07 | P2 | Duplicate TOC fragment IDs on three articles | Confirmed source replay against production HTML; browser clicks unverified |
| A08 | P2 | Import/editorial artifacts remain in articles, summaries and cards | Confirmed production content; editorial scope needs approval |
| A09 | P2 | Legacy article images omitted from Article JSON-LD | Confirmed metadata omission; SEO enhancement, not invalid-schema claim |
| A10 | P2 | Research/category lists fetch full, unbounded article collections | Confirmed source scaling risk; no measured Core Web Vitals failure |
| A11 | P3 | Header Account link disappears at 1024–1150 px | Confirmed CSS behavior; rendered review pending |
| A12 | P3 | Retired URLs on www take two redirect hops | Confirmed HTTP; optional routing polish |

P0 denotes privacy/email-safety priority, including an unresolved safety assurance requirement; it does not mean a confirmed security incident. P1 denotes broken behavior or substantial content integrity problems. P2 covers quality, accessibility and performance work. P3 is optional polish.

## Baseline and preservation

| Item | Result |
| --- | --- |
| Actual working directory | `E:\chronoverse-app\-chronoverse-core-master` — the existing session workspace; the task’s repository spelling differs |
| Branch | `master` |
| HEAD | `dea9254fb82b90076671d58e884dd58ba61eb1eb` |
| Initial working tree | Clean; `git status --short` returned no entries |
| Commit | `Prepare website release with SEO updates and newsletter signup pause`, 24 October 2026 00:39:02 +0300 |
| Production deployment | `dpl_B1SXXhWPNEu3tEJ5TKwp9BZvHZji`, `READY`, target `production` |
| Deployment hostname | `chronoverse-capital-p00jn8l47-chronoverse-capital.vercel.app` |
| Project | `chronoverse-capital`, `prj_eaR0kIu4T56IlK1nLyCCxkYsvFHk` |
| Production Git identity | Vercel deployment inspection reports `master` and the exact HEAD above |
| Aliases reported by Vercel | Apex, www, apps, `chronoverse-core.vercel.app`, project alias and master-branch alias |
| Backup | Owner-reported verified backup at `E:\chronoverse-backups\chronoverse-core-20261024-002555`; directory presence checked, contents untouched; restore integrity not re-audited |
| Changes made by this audit | This report and its public-evidence JSON companion only; no application code, configuration, dependencies or existing documents changed |

The earlier release documents were read to avoid proposing completed work again: `docs/seo-content-release-2026-10-23.md`, `docs/security-release-2026-10-23.md`, and `docs/newsletter-release-checklist.md`. Previously accepted dependency/tooling findings were not recast as new defects. No build, dependency installation or broad regression rerun was necessary for this read-only review.

## Method and access limits

Evidence is in [post-release-quality-audit-2026-10-24-evidence.json](./post-release-quality-audit-2026-10-24-evidence.json). It contains the page inventory, HTTP results, metadata, sampled asset results and focused source reproductions. Raw public responses were retained temporarily outside the repository at `%TEMP%\chronoverse-readonly-audit-20261024`; the JSON companion preserves reviewable evidence without requiring those temporary files.

- Direct production HTTP GET crawl: 97 requests, including the entire main sitemap, linked account page, apps catalog and machine-readable endpoints. One apps-root spelling was duplicated. Links were extracted from all crawled HTML; the only additional same-site page link was `/manifesto`, subsequently checked successfully.
- A narrow anonymous Sanity read checked only four already-published post documents (OGAS, Bonds, Sleepless Economy and Oil), projecting their public content fields. It confirmed the owning CMS fields behind the content/metadata defects; no subscriber, draft, private account or campaign document was queried. Excerpts are retained in the evidence JSON.
- 37 additional targeted requests covered redirects, intentionally retired/missing routes, account callback failure, studio shells, archive variants, newsletter signup rejection, and invalid-token unsubscribe. The **only POSTs** were an empty JSON object to the paused signup API and an explicitly invalid-token unsubscribe request. Neither supplied an email address or valid capability.
- 185 unique public asset URLs returned HTTP 200 to HEAD: images, JavaScript, stylesheets and fonts. This establishes HTTP availability, not browser execution or visual correctness. Three safe image GETs verified actual PNG/WebP responses; both generated share cards were 1200 × 630 PNGs.
- Five mobile-user-agent HTTP requests returned the expected HTML, titles and responsive viewport metadata. They are **not a substitute for a rendered mobile audit**.
- Installed Next.js metadata and accessibility documentation was consulted. Supabase’s current changelog and SSR guidance were checked for the auth review. No framework or dependency migration was undertaken.
- Offline source reproductions used captured public HTML, the actual TOC implementation with mocked React hooks, and the actual MathContent regex with installed KaTeX. Service credentials were excluded and the repository’s network-denying preload was enabled. These are deterministic source checks, **not browser tests**.
- The Browser integration reported `No browser is available`; its documented recovery/discovery returned `[]`. Consequently screenshots, layout measurements, mobile menu interaction, keyboard traversal, screen-reader output, hydration errors, console errors, browser network waterfalls and Lighthouse/Core Web Vitals remain **unverified**.
- Vercel deployment/project metadata was accessible. Team-scoped runtime-error and historical-deployment requests returned **403**. No Vercel CLI was installed for the documented fallback. Runtime logs, historical deployment inventory, current Cron settings and production environment values therefore remain unverified. The owner’s disabled-Cron statement is recorded as owner evidence, not independently attested platform state.
- No authentication email, registration, account mutation, sending endpoint, Sanity webhook, revalidation request, feedback notification, valid unsubscribe token or subscriber query was invoked. The Sanity Studio shell was fetched without executing it or opening its data panes.
- Search-service HTML for the homepage was explicitly dated two weeks old and described the retired market/VIP site. It was excluded from defect verification; current direct responses and Vercel commit identity establish the release baseline.

## Confirmed defects and priority safety work

### A01 — P0: unsubscribe is unavailable before token validation

**Affected:** `https://chronoversecapital.com/api/newsletter/unsubscribe`; `src/app/api/newsletter/unsubscribe/route.ts:11`, `:20`; `src/lib/newsletter/config.ts:21`.

**Reproduce safely:** GET the URL with no token, then with `?token=invalid-audit-token`. Both returned **503**, `Unsubscribe is temporarily unavailable`, with `Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow`. POST with the same invalid query token and `{}` returned **503**, `Unsubscribe could not be completed. Please try again.` An invalid token would ordinarily return 400.

**Root cause:** both handlers evaluate `unsubscribeSecret()` before validating the token. That function throws when `NEWSLETTER_UNSUBSCRIBE_SECRET` is absent or shorter than 32 UTF-8 bytes. Token parsing catches its own failures and returns null. The observed custom GET error therefore strongly isolates the failure to this configuration guard for the inspected revision. Actual environment values were not read, so missing versus too-short cannot be distinguished. A valid-link success path was deliberately not exercised.

**Proposed fix:** first establish the independent sending stop in A02. Then restore the **existing correct** unsubscribe secret and independently verify the storage configuration. Do not casually generate a replacement: previously issued encrypted links depend on the old secret. If it is lost, design a reviewed compatibility/recovery process and an owner-operated support path before claiming existing links work.

**Risk:** setting this secret could remove the last failing prerequisite from the sending gate if other sending flags are already true. Rotating it breaks old opt-out links. A working token parser alone does not prove suppression persistence.

**Required regression checks:** in an isolated fixture, prove missing/invalid tokens do not construct storage clients; valid GET never writes; valid POST durably suppresses; repeated POST is idempotent; failures remain truthful; historical keys remain compatible. Confirm all delivery routes remain blocked during this work. Any future production opt-out mutation needs separate owner authorization and a controlled record; none is authorized here.

### A02 — P0: delivery suspension is not tied to the code-level signup pause

**Affected:** `src/config/newsletterAvailability.ts`, `src/lib/newsletter/config.ts:27`, `src/lib/newsletter/transport.ts:30`, both dispatch routes, `vercel.json`.

**Reproduce without calling production senders:** inspect the constant `NEWSLETTER_SIGNUPS_PAUSED = true`; follow its imports into forms and `/api/newsletter`. Neither dispatch route nor `sendNewsletter()` checks it. The transport instead checks environment-based owner confirmations through `getNewsletterConfig()`. `vercel.json` still declares `/api/cron/send-newsletter` at `0 9 * * *` (09:00 UTC).

**Evidence/root cause:** signup and delivery are independent control planes. A manually authorized GET or POST to the Cron route can dispatch in digest mode even when platform scheduling is off. A valid Sanity publication webhook can dispatch in publication mode. These both converge on SES. The public notice says delivery is suspended, but that notice itself does not enforce suspension. Existing gates are fail-closed when prerequisites are missing; **no gate bypass or actual send was demonstrated**. A01 indicates a shared prerequisite is currently failing, but that is not a durable, comprehensive stop across historical deployments.

**Proposed fix:** add a reviewed explicit code-level delivery-pause policy, independent of signup and unsubscribe, checked before audience/storage work and rechecked at the transport boundary. Keep environment gates as additional protection. Separately have the owner inspect current and historical environment scopes, webhook targets and schedules, plus AWS permissions. Do not restore unsubscribe by enabling sending flags.

**Risk:** changing controls must preserve opt-outs and feedback processing. New code affects only deployments containing it; old immutable deployments may retain old behavior. A future deployment still contains a declared schedule, so its effective platform state needs rechecking after any release. Do not assume it will necessarily reactivate, or necessarily stay disabled.

**Required regression checks:** offline synthetic authorized Cron GET/POST and signed publication events must be rejected before audience reads or transport construction, even with every environment confirmation set true. Direct transport calls must also reject. Keep unsubscribe and verified suppression feedback available while paused. For historical deployments, review configuration without invoking send routes or reading subscribers.

### A03 — P1: OGAS page serves a different article

**Affected:** `https://chronoversecapital.com/ogas-the-soviet-cybernetic-failure`; content mapping at `src/lib/content.ts:249` and article rendering at `src/app/(site)/[slug]/page.tsx:455`.

**Reproduce:** GET the page. H1 is `OGAS: The Soviet Cybernetic Failure`; its description begins `Explore why the Soviet OGAS network failed`. The displayed body instead begins with `The First "Rug Pull" in History: The 1720 Protocol` and discusses the South Sea Bubble, British sovereign debt and Isaac Newton. Its generated executive summary also describes 1720.

**Root cause:** the published OGAS document itself has an OGAS title/description but a South Sea Bubble article in `bodyRaw`; the anonymous public-content check confirmed this and found no structured `body` text. The template faithfully renders the sanitized legacy body belonging to that document. This is confirmed CMS content contamination, not an incorrect route lookup or a sanitizer error. The intended replacement needs owner/editor confirmation.

**Proposed fix:** review the published OGAS document’s title, slug, description, `bodyRaw` and structured `body` together; restore the intended article and preserve its established URL. Introduce a clearly defined body source so stale legacy content cannot silently override the chosen current body. Revalidate the corrected public page, lists, feed and sitemap only in an approved implementation phase.

**Risk/tests:** replacing the wrong field can lose genuine editorial work; indiscriminately switching all articles to Portable Text can regress legacy content. Use this document as a focused fixture, plus legacy-only, Portable-Text-only and mixed-field cases. Assert visible body, summary, audio, metadata and JSON-LD describe the same approved article. No CMS content was changed during this audit.

### A04 — P1: currency text is consumed by the math parser

**Affected:** `src/components/MathContent.tsx:61`; confirmed input examples at `/is-90-oil-bringing-inflation-back`, `/hormuz-shock-the-next-global-liquidity-void`, `/the-100-trillion-sovereign-debt-macro-crisis`. Additional matching currency prose occurs on the Bretton Woods and Temporal Asset articles.

**Reproduce:** inspect a single text node in the Oil article: `$90-per-barrel threshold. Financial commentary routinely treats $90 crude oil`. The exact component regex matches `$90-per-barrel threshold. Financial commentary routinely treats $` as one inline equation. Offline KaTeX replay successfully produced math markup from that prose. Hormuz similarly matches `$2,845.50, while asymmetric capital front-runs the sovereign collapse via Bitcoin at $`.

**Root cause:** every pair of dollar signs within a text node is treated as inline LaTeX. Currency and math use the same delimiter without escaping/context rules. The component removes both matched delimiter characters and replaces the intervening prose with KaTeX output. This transformation is verified; its appearance in an interactive production browser remains pending.

**Proposed fix:** define an unambiguous authored math contract, preferably explicit math blocks or `\(...\)`/`\[...\]`, while preserving ordinary financial currency. Migrate or compatibly recognize existing reviewed dollar-delimited formulas. Do not simply disable all inline math or reject every expression beginning with a digit: valid expressions such as `$1.0$` exist.

**Risk/tests:** preserving legitimate formulas is essential. Test same-node multiple prices, escaped dollars, inline formatting boundaries, true inline/display equations, numeric equations, unmatched delimiters and mixed prose. Assert text/currency preservation and readable accessible math output; finish with rendered desktop/mobile review.

### A05 — P1: five audio briefings contain only the article title

**Affected:** `src/app/(site)/[slug]/page.tsx:445`; `src/components/AudioReader.tsx`. Published examples:

- `/2026-yen-carry-trade-why-the-200-ema-fails`
- `/gold-s-quiet-return-to-the-global-monetary-system`
- `/is-90-oil-bringing-inflation-back`
- `/the-thermodynamic-wall-ai-power-limits`
- `/what-if-a-mediterranean-volcano-triggered-a-market-shock`

**Reproduce safely:** inspect the production response’s serialized `textToRead` property without clicking the control. For the Oil article it is exactly `Is $90 Oil Bringing Inflation Back?. `, despite a substantial visible body and a `Listen to Full Briefing` label. The other four have the same title-only pattern. React Flight references on other pages were not misclassified as literal speech input.

**Root cause:** audio receives `sanitizedLegacyBody || currentPost.content`. The content mapper converts an array-valued Portable Text `body` to an empty string for `content`. The renderer separately supports `currentPost.body`, but the audio prop does not. Portable-Text-only articles therefore lose their narration body. Actual speech synthesis was not invoked.

**Proposed fix:** derive narration from the same selected, normalized body used for visible content, including Portable Text. Reuse the existing plain-text extraction with consistent legacy/structured precedence; handle headings, lists, captions and math intentionally.

**Risk/tests:** the raw-text summary currently prefers structured content while visible rendering prefers legacy content, so blindly reusing either variable may narrate a different revision. Use fixtures for both content forms and mixed records. Verify the five serialized props include actual body text, then manually check start/pause/resume/stop, unsupported speech APIs and navigation cancellation on desktop and mobile.

### A06 — P2: bonds metadata describes the sleepless economy

**Affected:** `https://chronoversecapital.com/the-smart-investors-codex-book-iii-bonds`; metadata precedence at `src/lib/content.ts:297` and `src/lib/seo/article.ts`.

**Reproduce:** inspect description, `og:description`, `twitter:description` and Article JSON-LD `description`. All say: `Explore the sleepless economy: how 24/7 financial trading introduces liquidity voids, automated flash risks, and macro volatility.` This is identical to `/the-sleepless-economy-247-global-markets-macro-risk`, while the bonds body discusses debt and sovereign bond markets.

**Root cause:** the public-content cross-check confirmed that Bonds and Sleepless Economy have the same authored `seoDescription`. Source precedence favors that field, then excerpt, then body, so the incorrect value is propagated consistently through every metadata output. This is a CMS content-value problem, not missing tags or title-template duplication.

**Proposed fix:** approve a bonds-specific factual description in the owning content field; preserve the canonical URL and shared metadata implementation. Revalidate public outputs after approved publication.

**Risk/tests:** avoid bulk regeneration of already correct metadata. Check the four outputs agree with the corrected description, titles/canonicals remain unchanged, and the sleepless-economy article keeps its own metadata. Search-engine snippet updates cannot be guaranteed or verified here.

### A07 — P2: TOC creates duplicate fragment identifiers

**Affected:** `src/components/autotoc.tsx:25`, `:45`; `/the-zombie-ledger-bank-account-trap`, `/the-thermodynamic-wall-ai-power-limits`, `/what-if-a-mediterranean-volcano-triggered-a-market-shock`.

**Reproduce:** replay the actual heading scan against captured production HTML. Zombie Ledger produces two `the-harsh-truth` IDs. The other two produce two `executive-summary` IDs, one from the generated summary and one from the authored body. Both TOC entries then use the same fragment target. Browser clicking was not available.

**Root cause:** IDs are slugified from heading text without deduplication. Scanning the first outer `article` also includes generated summaries and related-card headings, rather than only the authored reading body.

**Proposed fix:** scope the TOC to a dedicated body container and allocate unique deterministic IDs, respecting existing authored IDs and avoiding collisions with every ID in the page. Decide explicitly whether generated summaries belong in the TOC.

**Risk/tests:** preserve existing external deep links where possible. Test repeated headings, pre-existing IDs, punctuation/non-Latin headings and navigation between articles. Assert IDs are unique and each link lands on the intended heading; verify sticky-header clearance and keyboard use in a browser. The current fixed skeleton height does not by itself prove zero CLS when a long TOC replaces it.

### A08 — P2: residual import artifacts and diagnostic prose reach public cards

**Affected:** `/reports`, `/category/alpha-Insights`, `/category/macro-echoes`; Hammurabi, Medici, Petrodollar, Zombie Ledger and other article bodies; `src/lib/editorialArtifacts.ts:3`, report summaries at `src/app/(site)/reports/page.tsx:53`, category summaries at `src/app/(site)/category/[slug]/page.tsx:97`.

**Reproduce:** the Hammurabi report card includes `[Gear 03/12] Initiating Historical Forensi...`. Medici includes `GLOBAL LIQUIDITY: CRITICAL STRAIN`. Zombie Ledger cards/summary expose `Sovereign Yields: 6.14% | VIX: 38.2 | DXY: 108.4 | STATUS: SYSTEMIC SLAVERY DETECTED`. Bretton Woods, Hormuz and AI Sovereign Race bodies contain unresolved `[span_0](start_span)` / `(end_span)` markers.

**Root cause:** completed normalization targets the exact `SYSTEM ENTROPY CHECK` prefix and a bounded set of known fields. Other import artifacts remain, and report/category cards flatten the beginning of a body instead of preferring a reviewed excerpt. The executive-summary filter rejects only certain prefixes, so diagnostic prose can be promoted as a takeaway. **The exact completed SYSTEM ENTROPY CHECK cleanup was not found regressed.**

**Proposed fix:** obtain an editorial decision on what is intentional house style versus import residue. Remove narrowly identified artifacts at the content/ingestion boundary, preserve legitimate financial figures, use approved excerpts for cards, and exclude diagnostic/source-control markers from takeaway selection. Resolve broken citation placeholders rather than inventing sources.

**Risk/tests:** broad regular expressions could erase meaningful historical figures or wording. Use the exact observed strings as fixtures, preserving adjacent text, links and formatting. Check cards, summaries, descriptions, RSS and body consistently. Review scientific/economic assertions separately; this audit does not certify their factual accuracy.

## Measured enhancements and optional polish

### A09 — P2: Article structured data drops legacy images

**Affected:** 46 of 71 Article JSON-LD objects omit `image`; examples include `/the-smart-investors-codex-book-iii-bonds` and `/1929-vs-2025-margin-debt-the-next-market-crash`. See `src/lib/seo/article.ts:227` and `src/lib/content.ts:294`.

**Reproduce/evidence:** compare the visible legacy hero and `og:image` with the parsed Article object. The image is available and was HTTP-checked, but Article has no `image`.

**Root cause:** `featuredImage` is populated only for a Sanity `mainImage` asset. The legacy first-image fallback populates `imageUrl`/social metadata but is excluded from Article JSON-LD.

**Proposed fix:** reuse a validated representative visible image for Article markup, including legitimate legacy images. Keep author information factual: 44 Article objects also omit author because no resolved author is supplied; that is an editorial completeness question, not permission to fabricate bylines.

**Risk/tests:** do not label unrelated decorative images as article illustrations. Test main-image, approved legacy-image and no-image cases; verify URL availability, semantic agreement and structured-data output. Existing JSON-LD is syntactically valid; Google eligibility or ranking improvement is not established by adding an optional field.

### A10 — P2: article listings scale with complete article bodies

**Affected:** `/reports`, category listings; `src/lib/content.ts:211`, `:372`, `src/app/(site)/reports/page.tsx:26`.

**Reproduce/evidence:** Reports renders all 71 articles and returns 240,641 HTML bytes (27,780 bytes gzip in the mobile-UA sample). The listing loader selects full body arrays, raw HTML and manual-related document projections without a result bound. Category queries also load full matching documents. The largest sampled article response was 365,041 uncompressed bytes. These are response sizes, not JavaScript transfer totals or measured layout/interaction delays.

**Root cause:** collection pages reuse the complete detail-page projection and render the entire collection. Existing bounded homepage and related-article loaders already address their own scope; they should not be rewritten without need.

**Proposed fix:** introduce a lean listing projection and, if justified by measured cost, bounded server pagination with crawlable links. Preserve complete discovery of all current articles and intentional archive noindex policy. Maintain accurate card excerpts and read-time data without downloading every full body on listing renders.

**Risk/tests:** pagination can orphan older articles or create incorrect canonicals. Verify every current article remains reachable, ordering is stable, page parameters/canonicals are coherent, categories remain populated, and failed CMS requests do not masquerade as empty successful lists. Obtain browser performance traces before setting a performance budget or claiming a Core Web Vitals failure.

### A11 — P3: Account disappears from the header in a narrow desktop band

**Affected:** shared Header; `src/app/platform.css:846`, `:854`, `:870`.

**Reproduce/evidence:** inspect CSS at 1100 px: `@media (max-width:1150px)` hides `.cv-account-link`; the mobile menu is enabled only below 1024 px. Home, apps and research retain the footer Account link. This is a source-confirmed discoverability inconsistency, not a verified layout failure or inaccessible account route.

**Root cause/fix:** mismatched responsive visibility thresholds. If the rendered header has room, keep Account visible; otherwise switch to the mobile navigation at the same threshold. Review before changing the layout.

**Risk/tests:** test 1023/1024/1100/1150/1151 px, long labels, 200% zoom and keyboard focus. Preserve the owner-approved navigation and the menu’s existing Escape/focus-return behavior.

### A12 — P3: www retired aliases take an extra redirect

**Affected:** `https://www.chronoversecapital.com/research` and analogous retired aliases.

**Reproduce/evidence:** www `/research` returns **301** to apex `/research`; apex then returns **308** to `/reports`, which returns 200. Apex `/research`, `/intelligence`, `/markets` and `/markets/eur-usd` already redirect directly to `/reports`.

**Best-supported cause/fix:** the www domain redirect appears to run before the application’s retired-alias redirect. App code already has a direct absolute destination; exact Vercel redirect settings were not inspected. Optionally consolidate domain/path rules after reviewing current platform configuration.

**Risk/tests:** low severity; do not change routing for this alone without a concrete reviewed configuration. Preserve HTTPS, safe query strings, non-retired paths, article aliases, apps routing and unknown-path 404 behavior. Verify redirect loops are impossible. No configuration changes were made.

## Newsletter architecture and safety inventory

The following is the complete set of newsletter sending call sites found in current application/script source. Source inspection does not inventory external infrastructure or prove historical releases match it.

| Entry point | Authentication / mode | Sending behavior | Audit action / conclusion |
| --- | --- | --- | --- |
| `/api/cron/send-newsletter`, GET **and POST** | `CRON_SECRET` bearer check; `digest` mode; send confirmations/configuration | Loads UTC digest window and private audience, freezes campaign, dispatches through SES transport | **Not invoked**; disabling Vercel scheduling does not disable direct authenticated requests |
| `/api/webhook/sanity`, POST | Sanity signature, freshness, expected project/dataset, document headers; create/new-published post; `publication` mode | Loads exact published revision and dispatches via the same durable campaign/store/SES transport | **Not invoked**; independent of Vercel Cron scheduling |
| `src/lib/newsletter/transport.ts` | `server-only`; repeats `getNewsletterConfig()` before constructing SES client | Sole application SDK send boundary: AWS `SESClient` + `SendRawEmailCommand`, one recipient per request, `maxAttempts:1` | Source searched for alternative SMTP/SDK/script implementations; none found in the reviewed current tree |
| `/api/amazon`, POST | Current handler is explicitly retired | Returns 410, no sending code | Source-only verification; **legacy sending URL not invoked** |
| `/api/newsletter`, POST | Hardcoded signup pause before reading body or constructing storage | Returns 503 pause JSON; active helper only persists signup, never sends | Empty-object live request confirmed pause; no address supplied |
| `/api/newsletter/unsubscribe`, GET/POST | Encrypted authenticated capability using separate secret | GET confirms without writing; POST writes durable suppression and deactivates matching subscribers; no sending | Only invalid/missing tokens tested; A01 blocks current validation |
| `/api/newsletter/feedback`, POST | Expected SNS topic, AWS certificate-host allowlist and signature verification | Records hard-bounce/complaint suppression, not outgoing newsletter mail | Source review only; no SNS message, confirmation or subscriber write invoked |
| `/api/revalidate` | Signed Sanity event | Invalidates public paths/feed/sitemap, not sending | Not invoked |
| Blogger image webhook / retired SEO-generation webhook | Signed document mutation / 410 retired route | No direct mail transport | Not invoked; publishing workflows may separately trigger configured Sanity delivery webhooks |
| Account email OTP server action | Supabase authentication workflow | Can send a transactional sign-in email and may create identity according to project settings | Separate from newsletter; deliberately not submitted |
| RSS / feed routes | Public read | Generate/redirect feed output; no email-send call | GET checked safely |

### Existing safeguards preserved

`getNewsletterConfig()` requires **all** of `NEWSLETTER_SENDING_ENABLED`, `NEWSLETTER_IDENTITY_CONFIRMED`, `NEWSLETTER_SENDER_CONFIRMED` and `NEWSLETTER_FEEDBACK_CONFIRMED` to equal `true`, plus a valid sender, verified postal address, AWS region, matching SNS topic ARN, explicit digest/publication mode and a valid unsubscribe secret. No defaults grant permission to send. The transport validates the recipient and canonical unsubscribe origin/path and rechecks configuration.

The store uses dedicated read/write tokens with no general-editor-token fallback; private dotted document IDs; explicit active/unsuppressed audience selection; durable suppression checked immediately before handoff; campaign snapshots; revision-based delivery claims; at most three attempts for known failures; and held/unknown outcomes that are not automatically resent. Publication keys deduplicate by document ID, digest keys by UTC window. These are code safeguards, **not verified production IAM, ACL, consent or persistence guarantees**. Changing modes can create different campaign keys and needs duplicate-risk review.

Unsubscribe intentionally remains independent of `NEWSLETTER_SENDING_ENABLED`; turning sending off must not disable opt-outs. GET is non-mutating. Tokens are AES-256-GCM opaque capabilities, not plaintext subscriber addresses. Invalid tokens were never converted into addresses or passed to storage in this audit.

### Unresolved deployment and provider risks

1. Owner-disabled Cron is only scheduling evidence. Production gate values, AWS credentials/permission state, Sanity webhook enablement/targets and outstanding provider retries were not inspected.
2. Both sender routes can exist on aliases serving this project, including apps-host API paths that bypass the page rewrite. No such route was invoked on any host.
3. Older immutable deployments can keep older code and deployment-scoped environment snapshots. A new code pause or updated project variable is not proof that every older deployment is safe. Historical listing was access-denied; no old hostname was guessed or probed for sending behavior.
4. Vercel project metadata reported SSO protection for deployments other than custom domains. This is helpful evidence but not proof of the effective accessibility of every historical alias/API request or configured bypass. Password protection was reported disabled. No protection setting was changed.
5. Old direct `/api/amazon` implementations, previously configured webhook destinations, other hosting copies or external SES clients may lie outside this checkout. Current-tree retirement does not establish their absence elsewhere.
6. Sanity subscriber/audience/ledger permissions, historical consent and opt-outs, SES sender-domain authentication, regional identities, SNS routing and actual inbox delivery were not verified. The previous newsletter checklist already identifies these approval gates; it should be reused, not treated as completed production verification.
7. A01’s failing shared secret prerequisite supports fail-closed behavior in this revision’s transport when the same deployment configuration is used. It does **not** establish a permanent stop or resolve points 1–6. Restoring opt-outs must be sequenced so it cannot accidentally authorize dispatch.

## Public website, workflows and SEO coverage

| Area | Verified observations | Remaining limits / required follow-up |
| --- | --- | --- |
| Homepage / apps | Current software-focused content, truthful pre-launch/empty app registry, current H1/title/metadata, three reachable research previews, working internal destinations | No rendered desktop/mobile visual sign-off; empty catalog is intentional, not missing inventory |
| Header / footer | Current Home/Applications/Research/About/Account links and legal/trust destinations resolve. No current public link to retired VIP/pricing was found. Social anchors have accessible labels in source | Menu expansion, focus order, zoom, wrapping and touch interaction unverified; A11 is a source observation |
| Research / categories | All 71 article routes and both populated category routes return 200; category slug casing `alpha-Insights` is intentionally preserved; unknown category returns 404 | A03–A10; future content growth and actual rendering need review |
| Article links | Extracted internal page links resolve; related articles remain crawlable in the server-rendered block | Dynamic TOC/accordion links require browser review. External share intents were not opened or submitted; third-party references/social destinations were not exhaustively crawled |
| Legal / trust | About, contact, FAQ, methodology, data sources, freshness, editorial policy, disclaimer, privacy, terms, DMCA, cookies and purchase/refund information all 200; linked manifesto 200/noindex | Legal accuracy, contributor affiliations and factual research verification remain owner/editor responsibilities already documented by the release |
| Login / registration / account | `/account` returns a signed-out/free shell and labelled required email input; `type=email`, max length and generic server validation are present; noindex/nofollow and private no-store response | No sign-in/registration email, new user creation, authenticated session, sign-out or role RPC executed. Supabase project signup policy, redirect allowlist, templates, SMTP/CAPTCHA/rate limits and production RLS remain unverified |
| Account callback | GET `/auth/confirm` without a code returns 303 to fixed `/account?authError=callback`; source ignores user-supplied redirect destinations | Valid code exchange/session cookies not tested. `/login` and `/register` are unlinked 404s; `/account` is the intended entry point, so no broken workflow is inferred from those guessed paths |
| Admin | `/admin` and `/dashboard` return 404. `/studio` and `/studio/structure` return the Sanity application shell with noindex/nofollow | A public Studio shell is not proof of data exposure. Actual Sanity sign-in, project role permissions, subscriber ACLs and anonymous/malicious-client access were not tested. No subscriber pane/query accessed |
| Authorization source | Claims verification precedes scoped `resolve_my_access`; trusted DB roles are checked against authenticated subject, not editable user metadata. Migration enables RLS/private-schema revocations and restricts RPC execution | Repository migrations do not prove deployed policies. No owner/admin/nonadmin identity matrix was exercised |
| Contact | `/contact` intentionally exposes a mailto address and support instructions, not a form. No contact-form endpoint or validation workflow exists to test | Email deliverability not tested; adding a form is a product choice, not a repair of a confirmed missing feature |
| Newsletter pause | `/newsletter` shows pause notice and research link; homepage/FAQ/privacy wording reflects the pause; no public signup form in crawled output; empty POST returns explicit 503 pause code | Signup protection verified; delivery safety remains A02; unsubscribe A01 |
| Retirements / redirects | `/research`, `/intelligence`, `/markets[/...]` → 308 `/reports`; `/billing` → 308 `/contact`; `/apps` → apps host; apps `/about` and `/account` → apex; `/feed.xml` → 301 `/rss.xml` | Retired `/vip`, `/pricing`, `/products` and fabricated missing article return intentional 404. Newsletter subdomain lookup failed in this resolver, but no current page links to it; no public broken-link defect claimed |
| Titles / descriptions | All crawled successful public HTML has a title, description, canonical, Open Graph identity/image and Twitter card; each has one H1. No accidental duplicated brand suffix observed | A06 is the substantive duplicate/misleading description; equivalent apps root spellings and slash/no-slash host roots are not treated as duplicate-page defects |
| Canonicals / indexability | Canonicals use correct production owner; account noindex/nofollow; archive noindex/follow with page-specific canonical; negative archive page normalizes to archive canonical; manifesto/studio noindex | Reports/category `?page=2` are currently ignored and canonicalize to base; no pagination links advertise them, so they are not broken page-two controls. Actual search indexing/Search Console status unavailable |
| Robots / sitemaps | Both main and apps robots/sitemaps return parseable 200 responses. Main robots permit public image relay/OG while disallowing API/private/studio crawling. Main sitemap has 89 expected entries; apps sitemap contains its root | Crawl directives are not access control. No fabricated product pages or private account/studio entries were found in the sitemap |
| Open Graph | Default and dynamic share image GETs returned valid 1200 × 630 PNGs; selected homepage relay returned a valid WebP; all inventoried image URLs returned 200 to HEAD | No visual share-card/crop inspection or social cache verification |
| Structured data | Parsed 71 Article objects plus breadcrumb/site identity markup; no JSON parse failures. Article publication/modification dates are present; identity avoids invented products/ratings | A09 image omission; no Google rich-result test or search eligibility guarantee |
| Accessibility source | English language, responsive viewport up to 5× zoom, skip-to-content/focusable main on shared site, labelled account input/social controls, menu expanded state/Escape handling, responsive grids and reduced-motion CSS are present | No WCAG conformance claim. Screen-reader behavior, actual contrast combinations including legacy inline styles, 320px reflow, 200/400% zoom, touch targets, sticky-header overlap and full keyboard checks pending |
| Typography / images | Shared Geist/Geist Mono and palette tokens; mobile breakpoints at 767/1023 px; reserved hero/card boxes; image alt attributes present in crawled markup (decorative logos intentionally empty) | No visual consistency/crop/spacing sign-off. Missing HTML dimensions on fill images are not independently a CLS defect because wrappers reserve space; legacy image sizing already has a CSS safety rule |
| Basic performance | CDN cache HIT on sampled static pages, gzip responses, 185/185 asset HEAD success. Mobile-UA round-trip samples: homepage 0.936s/14,985 gzip bytes, reports 0.921s/27,780, apps 0.388s/10,571 | Single-client network samples are not TTFB benchmarks, LCP, INP or CLS measurements. Browser waterfall, CPU cost, hydration, layout shifts and analytics-after-consent require browser evidence |
| Runtime / console | Confirmed production exception symptom is unsubscribe’s controlled 503. No unexpected 500 among the crawled public pages | Vercel logs 403; browser unavailable. No claim of clean console or absence of historical runtime failures |

## Prioritized implementation plan — approval required

1. **P0 safety, before restoring dependencies:** approve an explicit delivery pause covering routes and transport; preserve signup pause, unsubscribe and suppression feedback. Obtain owner/configuration evidence for current/historical deployment scopes, Cron and webhook targets without calling any sender. Then recover the correct unsubscribe secret/storage prerequisites. A send-disabled flag and an independently verified pause must remain in place throughout.
2. **P1 article integrity and broken functionality:** reconcile the OGAS content record with an editor; implement a shared, explicit body-selection/plain-text contract for visible body, summary and audio; repair math delimiter ambiguity without damaging legitimate formulas. Keep each change narrowly reviewable.
3. **P2 targeted quality:** correct only the bonds description; scope/deduplicate TOC anchors; address approved import residue and excerpt selection; include representative legacy images in Article markup; measure and reduce listing query cost before adding pagination.
4. **Complete blocked verification before sign-off:** connect a browser and test 1440/1280 desktop, 1024/1100 breakpoint band, 768 tablet, 390/375/320 mobile, keyboard and reduced motion. Capture console/network evidence on home, apps, reports, category, legacy and Portable Text articles, newsletter, contact and signed-out account. Use only isolated auth/storage fixtures unless separately authorized. Obtain Vercel runtime/configuration evidence through authorized access. Any real email or production subscriber mutation remains a separate explicit approval.
5. **P3 only if useful after rendering:** align Account visibility and optionally remove the www redirect hop. These should not displace privacy, content or functional repairs.

Acceptance requires truthful metadata and body agreement, full-body audio props, preserved currency/math, unique working TOC fragments, invalid requests without storage access, functional isolated opt-out persistence, and a demonstrated delivery stop with all sending prerequisites otherwise synthetically enabled. Final browser/access evidence must close the stated gaps; this document is **not** a claim that blocked tests passed.

No fixes, commits, pushes, deployments, production configuration changes, email sends or subscriber-data modifications were performed. Implementation must wait for owner approval.
