# Chronoverse free-only implementation

Local changes only. No commit, push, deployment, migrations, provider changes,
Vercel settings changes, production-data reads or transactions were performed.

## Policy and behavior

`src/config/siteAvailability.ts` deliberately returns a fixed free-only policy.
It does not inspect environment variables, credentials, cookies, identity or
request flags. Missing payment credentials are not the sales shutdown mechanism.

- `/pricing`, `/premium`, `/vip` and all their descendants return 404 before
  session refresh, canonical redirects, newsletter rewrites or streaming. The
  retired sponsorship route also returns 404. Pages retain a direct notFound
  guard as defense in depth. Retired metadata is neutral and noindex.
- POST `/api/billing/checkout` returns 410, `checkout-disabled`, no-store before
  reading its body or invoking any dependency. The shared checkout service also
  rejects first. Original provider code remains behind the guard.
- All five protected intelligence APIs return 404, `not-found`, no-store at their
  shared boundary before authorization or Deep data loading. Admin/owner roles
  and existing sessions cannot bypass this gate.
- Subscription portal route/service also reject first (410 at the route), since
  the owner confirmed there are zero VIP subscribers. Existing portal code is
  retained; one-time purchase support uses Contact and original receipts.
- Free account identity resolution skips commercial configuration and billing
  queries while retaining verified identity and role checks. Historical billing
  composition and lifecycle evaluators remain available in retained code.
- Public navigation, pages and metadata no longer promote VIP, pricing, external
  research checkout or sponsorship. The historical paid page implementations
  and homepage promotional components remain dormant behind the fixed policy.
- Billing renders purchase support without customer lookups or subscription
  upsells. Terms, Privacy, FAQ and Contact truthfully describe historical
  Lemon Squeezy/Gumroad sales as one-time books or digital products. Original
  purchase terms, customer rights, refunds and disputes are not waived.

## Preserved functionality

All five Lite engines (EUR/USD, EUR/JPY, EUR/GBP, EUR/CHF and €STR), ECB source
adapters/attribution, analytical logic, canonical caches, persistence and
freshness are retained. Only the shared Deep delivery boundary changes within
market production source. Articles, categories, archives, legacy redirects,
RSS, newsletter signup/delivery, audio, printing, sharing, consent and free
accounts remain. Homepage presentation is extracted into a fixture-testable
component; the route still loads the same Lite projection map exactly once.

Historical webhook ingress/signatures, receipt processing, subscription/payment
lifecycle, refund processing and migrations are unchanged. No provider customer
or order data was inspected. The existing handler's supported event set is
unchanged: retaining it does not establish coverage of every one-time purchase
refund or chargeback event. Original provider receipts and support remain needed.

`next.config.ts`, `Dockerfile`, `.dockerignore` and `docs/docker.md` were compared
with saved pre-task SHA-256 hashes and remain byte-for-byte unchanged.

## Local verification

Safe regression command (existing installed dependencies only):

```powershell
node scripts/tests/run-readiness.mjs safety auth-billing launch-products free-public content-backup
```

The runner strips application/cloud credentials, blocks environment-file reads
and Node networking, and uses fixture/injected service boundaries. Logs are in
`.next/readiness/`. A test-only Windows `os.userInfo` fallback handles restricted
`uv_os_get_passwd` access needed by tsx's temporary IPC path; application identity
and authorization are unaffected.

The tested groups cover offline safety, authentication and billing, all five
launch engines, rendered public pages, real Next Proxy matcher compilation and
production route dispatch helpers, retired route 404s, Deep/checkout/portal
no-call guarantees, legal disclosures, historical refunds/webhooks, editorial
SEO, RSS and backup contracts. TypeScript is checked with `--noEmit
--incremental false`; ESLint runs on changed source/tests without `--fix`.

No production Next build or connected browser session was run: those could load
real environment files, query the CMS/providers or progress persisted state.
Local fixture checks are not evidence about live CMS content, live settings or
old deployments.

## Validation results

| Check | Result |
| --- | --- |
| safety | 9 passed, 0 failed |
| auth-billing | 44 passed, 0 failed |
| launch-products | 218 passed, 0 failed |
| free-public | 6 passed, 0 failed |
| content-backup | 78 passed, 0 failed |
| TypeScript (no emit, no incremental writes) | Passed |
| ESLint (changed source and tests, including new files) | Passed with no warnings |
| Existing Docker/configuration hashes | Unchanged |
| Engine/cache/freshness and historical payment processor comparison | Unchanged except the intended Deep delivery gate |

Total: 355 passing regression checks; none skipped or cancelled.
These are local fixture results, not deployment validation.

## Release gates

1. Vercel Hobby eligibility remains unconfirmed. Removing checkout does not
   establish noncommercial personal use. Obtain Vercel confirmation for the
   actual site, brand, team, historical support and business activity.
2. Inventory and review old previews, branch aliases and immutable deployment
   URLs. Local code does not disable an old build or revoke provider links.
3. Review previously issued external checkout URLs and external storefronts.
   Provider accounts and their behavior were not changed.
4. Review remote Sanity article/page bodies, metadata, images, captions, manual
   links and legacy HTML for paid promotions. No production CMS content was
   accessed or changed; no blanket content filter was added.
5. Review live environment scope, webhook destinations, quota/usage and free
   external-service limits before any later deployment approval. Historical
   processing remains intact and must not be accidentally dropped.
6. Rollback would restore sales/access behavior. It requires deliberate review,
   especially before any future deployment.

## Rollback (instructions only; not executed)

A local pre-task source snapshot is preserved in `.next/free-only-baseline/`.
`manifest.json` there lists exactly the modified and added implementation files.
`protected-hashes.json` identifies the four pre-existing Docker/configuration
files that must stay untouched.

To roll back locally, first save any subsequent user edits and compare current
file hashes with the manifest. Restore only paths in `modified` from their
matching snapshot copies; remove only paths in `added` after review. Do not use
`git reset --hard`, `git clean`, or a blanket restore: those could destroy the
pre-existing Docker work or newer changes. Do not change the four protected
files. If the ignored snapshot has been removed, use the reviewed base revision
`b1a14e0` to restore only the listed tracked paths and separately review new files.
No database or provider rollback is needed because none was changed.

## Changed files

Modified existing files:

- `public/llms.txt`
- `scripts/tests/offline-network-preload.mjs`
- `scripts/tests/run-readiness.mjs`
- `src/app/(site)/about/page.tsx`
- `src/app/(site)/account/page.tsx`
- `src/app/(site)/billing/page.tsx`
- `src/app/(site)/contact/page.tsx`
- `src/app/(site)/editorial-policy/page.tsx`
- `src/app/(site)/faq/page.tsx`
- `src/app/(site)/manifesto/page.tsx`
- `src/app/(site)/markets/page.tsx`
- `src/app/(site)/methodology/page.tsx`
- `src/app/(site)/page.tsx`
- `src/app/(site)/premium/page.tsx`
- `src/app/(site)/pricing/page.tsx`
- `src/app/(site)/privacy-policy/page.tsx`
- `src/app/(site)/reports/page.tsx`
- `src/app/(site)/sponsors/page.tsx`
- `src/app/(site)/terms-of-service/page.tsx`
- `src/app/(vip)/vip/layout.tsx`
- `src/app/(vip)/vip/markets/[market]/page.tsx`
- `src/app/(vip)/vip/markets/page.tsx`
- `src/app/(vip)/vip/page.tsx`
- `src/app/api/billing/checkout/route.ts`
- `src/app/api/billing/portal/route.ts`
- `src/app/layout.tsx`
- `src/app/newsletter/layout.tsx`
- `src/app/newsletter/page.tsx`
- `src/app/sitemap.ts`
- `src/components/home/FreeMarketSurface.tsx`
- `src/components/home/tests/freeHomepage.test.ts`
- `src/components/navigation/Header.tsx`
- `src/components/navigation/tests/administrativeSurfaces.test.ts`
- `src/components/navigation/tests/institutionalNavigation.test.ts`
- `src/components/navigation/tests/publicLaunchIntegrity.test.ts`
- `src/config/institutionalNavigation.ts`
- `src/lib/auth/access.ts`
- `src/lib/auth/tests/container-ingress.test.ts`
- `src/lib/auth/tests/proxy-matcher.test.ts`
- `src/lib/auth/tests/proxy-session-refresh.test.ts`
- `src/lib/auth/tests/proxy.test.ts`
- `src/lib/billing/lemonCheckout.ts`
- `src/lib/billing/lemonPortal.ts`
- `src/lib/billing/tests/billingUi.test.ts`
- `src/lib/billing/tests/lemonCheckout.test.ts`
- `src/lib/billing/tests/lemonCheckoutRoute.test.ts`
- `src/lib/billing/tests/lemonPortal.test.ts`
- `src/lib/billing/tests/lemonPortalRoute.test.ts`
- `src/lib/billing/tests/pricingCheckout.test.ts`
- `src/lib/markets/services/vipDeepDelivery.ts`
- `src/lib/markets/tests/services/vipDeepDelivery.test.ts`
- `src/lib/seo/tests/b8b-failure-and-indexing.test.ts`
- `src/lib/seo/tests/canonical-host.test.ts`
- `src/lib/seo/tests/commercial-public-truth.test.ts`
- `src/lib/seo/tests/indexing-safeguards.test.ts`
- `src/lib/seo/tests/legacy-redirects.test.ts`
- `src/lib/seo/tests/newsletter-search-identity.test.ts`
- `src/lib/seo/tests/public-image-delivery.test.ts`
- `src/lib/seo/tests/public-route-hardening.test.ts`
- `src/lib/seo/tests/static-routes.test.ts`
- `src/lib/seo/tests/vip-search-policy.test.ts`
- `src/proxy.ts`

Added files:

- `docs/free-only-mode.md`
- `src/components/home/FreeHomePageContent.tsx`
- `src/config/siteAvailability.ts`
- `src/lib/seo/tests/free-only-public.test.ts`
