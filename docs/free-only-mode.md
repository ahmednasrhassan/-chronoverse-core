# Publication and legacy retirement

Audit date: 2026-10-23. Starting point: clean, synchronized `master` at `f782aee`.
The earlier five-market engine/VIP cleanup is already in Git history (`686ada9`).
[Exact files, retained dependencies, and verification](retirement-audit.json).

## Scope and routing

The remaining Bitcoin, gold, oil, and S&P 500 page stubs, individual market API
stubs, disabled billing APIs, acquisition cron stub, and billing presentation
page are removed. Unused storefront presentation settings, the unreferenced
Gemini SEO helper, and unused Markdown math adapters are removed. Five bulky
previous cleanup reports are consolidated here; their contents remain recoverable
from `f782aee`. Every deleted tracked file was checked with `git cat-file` first.
Published research, article archives, legal rights/disclaimers, brand assets,
Sanity publishing, newsletters, account identity, consent, analytics and feeds remain.

| URL family | Behavior |
| --- | --- |
| `/markets/*`, `/intelligence`, `/research` | One permanent hop to the canonical `/reports` URL; query preserved |
| `/billing` and descendants | One permanent hop to the existing canonical `/contact` page |
| `/api/markets/*`, `/api/billing/*`, `/api/market-data`, `/api/cron/ecb-live-progression` | 410 JSON, no-store, noindex before sessions, body parsing or host rewrites |
| `/pricing/*`, `/premium/*`, `/vip/*`, `/sponsors/*` | Non-streamed no-store, noindex 404 before sessions or rewrites |
| `/account/*`, `/auth/*` | Existing verified identity, session rotation and cookie handling |

API retirement also covers the family roots and descendants. Next configuration
redirects remain because they protect historical links after page deletion.
Proxy matchers cover every host, descendants and asset-like suffixes. Tests cover
Next's decoded production dispatch, methods, cookies, RSC/prefetch/action headers,
query handling, similar-name negative controls, and the live webhook/newsletter paths.
Retired labels in security tests are intentional regression inputs, not marketing.

Purchase-support links now use `/contact`, verified as HTTP 200 on the public
site during this audit. Existing receipts and original customer rights still apply.
The smoke tool distinguishes current publication checks from retirement probes and
supports an explicitly supplied `--apps-url` without defaulting to production.

## Commercial retirement blocker and retained dependency graph

Read-only GET requests to the official Lemon Squeezy list APIs using the existing
local API credential returned empty stores, subscriptions, orders, invoices and
webhooks. With no store returned, this does not establish coverage of the production
store or establish that refunds, disputes, chargebacks or delivery obligations have
ended. Commercial inactivity is **unverified**. No provider settings were changed.

Consequently `/api/webhooks/lemon-squeezy` and all production files under
`src/lib/billing` remain. The webhook depends on signature verification, production
store/product scope checks, private receipt ingestion, subscription/refund/payment
lifecycle processing, identity parsing, Supabase service clients and immutable RPC
migrations. The unused subscription-management reader and its lifecycle/entitlement
helpers also remain under the explicit obligation-verification restriction. They do
not expose checkout or feed paid entitlement into free-site authentication.

The readiness runner retains all associated billing and authentication contracts;
only tests of removed page/API modules are retired. Central proxy tests replace
individual stub tests with actual matcher and request-boundary coverage. No applied
migration, environment file, live table, customer record, payment configuration,
DNS record or Vercel configuration is changed. The existing Gumroad products and
historical transactions are untouched. No new integration, subscription or app exists.

## Apps and release boundaries

`apps.chronoversecapital.com` resolves through its existing Vercel CNAME and returned
HTTP 200 during the read-only check. Its current response is the publication home
page; there is no separate app catalog implementation or host rewrite in this
repository. This cleanup preserves that arrangement. It does not establish the
readiness of a future downloadable-app catalog.

The Vercel connector could list the project but returned 403 for scoped project
inspection. Deployment status must be reported as unconfirmed unless later
inspection succeeds; an HTTP response alone does not prove a new deployment is READY.

All four requested npm commands and production route checks must pass before push.
The build may use temporary single-worker settings on the 4 GB local machine;
these affect concurrency only and must be restored before committing. Evidence in
`.verification/` is ignored and excluded from lint, which still checks shipped code,
scripts and tests. No lint rule, compiler check or test-network guard is disabled.
The existing raw article-image lint warning and OG Edge-runtime deprecation remain
outside this retirement. Existing publisher lint errors and undeclared dependencies
are repaired with ESM, explicit CLI dependencies and an offline rendering regression
covering headings, inline markup, display math and no upload.

## Final verification and release hold

The four requested npm commands pass. The suite passes 114 tests across 56 files,
with no skips or cancellations. The production build generates 108 static pages.
All 202 built-server HTTP checks pass, including a published gold article,
account sign-in presentation, feeds, newsletter aliases, apps-host behavior,
retirement methods/encoding/host boundaries and direct final redirect destinations.
The smoke-plan safety controls also pass. Temporary build settings are restored.

An additional `npm audit --json` exits 1: 26 existing advisories (7 moderate,
17 high, 2 critical). The critical package summaries are `next` and `dompurify`.
Every vulnerable installed node is present at the same version in `f782aee`;
this cleanup introduces no new vulnerable node. Some proposed remediations involve
major Sanity/Next tooling changes, including downgrades. No automatic audit fix or
unreviewed dependency migration is applied as part of this removal.

**Release is held:** commit the verified cleanup locally, but do not push `master`
while that security check remains unresolved. The production deployment is not
triggered by this cleanup, and no new Vercel READY status is claimed. Full Lemon
retirement remains separately blocked on verified production commercial obligations.
