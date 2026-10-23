# Chronoverse software platform release

This release continues from security commit `4f51367597e41898a0d8da4e7fa3ee52e76f08c3`.
The root dependency manifest and lockfile retain that release's patched versions.

## Public experience

- The main homepage introduces original software, a dedicated applications entry,
  an honest pre-launch collection, the platform's approach and real Sanity articles.
- The apps subdomain has its own catalog. It is free to browse and needs no account.
  There are no released products, invented reviews, revenue metrics or downloads.
- Reusable discovery, cards, detail pages, features, requirements, release status
  and download information use an empty, reviewed application registry. Unknown
  products return 404. Unsafe download schemes and credentials are rejected.
- Catalog canonicals, robots and sitemap belong to the apps host. Editorial URLs,
  RSS and the primary sitemap retain the main host. Preview hosts remain noindex.
- Navigation and footer use explicit main-site and catalog destinations. The
  mobile menu supports keyboard activation, Escape and visible focus. Animations
  respect reduced motion. The hero artwork uses CSS, without an animation library.

## Palette and typography

The values below are verified in `src/app/globals.css` at the previous production
commit. No separate owner-approval record was found, so these are described as the
established repository tokens, not a newly approved palette.

| Token | Value |
| --- | --- |
| --bg-page | #050506 |
| --bg-card | #0D0D11 |
| --bg-raised | #15131A |
| --text-primary | #F3EBDD |
| --text-secondary | #CFC5B8 |
| --text-muted | #91889A |
| --accent-mauve | #C8A7E8 |
| --accent-purple | #A77BD8 |
| --accent-purple-dark | #6F4C91 |
| --border-color | #292432 |

Typography retains Geist and Geist Mono through the existing font setup. The
abstract decorative letter uses the system Georgia serif. Header and footer reuse
the existing 192 px brand icon (76,803 bytes), avoiding the 1,931,679-byte full-size
logo download without replacing the original asset. Transparent mixtures
of the established violet tokens provide the decorative grid and surface glow.

## Legacy commercial retirement

The owner confirmed account closure, completed one-time book purchases, no
recurring subscriptions or renewals. Provider settlement is outside the
application. That confirmation resolves the previous runtime
retention hold. The application performs no payout, refund, bank or financial-data
operation in this release.

The retired webhook and descendants return 410 before auth/body parsing, with
no-store and noindex. The historical billing page still redirects to contact.
No payment SDK dependency was exclusive to the removed modules; they used native
HTTP/crypto and the shared Supabase client. Supabase remains for authentication,
AWS SES for the newsletter, and all security overrides remain. No Gumroad
integration, checkout, subscription, licensing or payment webhook is introduced.

Removed runtime and associated test files:

- `src/lib/billing/billingManagement.ts`
- `src/lib/billing/commercialIdentity.ts`
- `src/lib/billing/entitlement.ts`
- `src/lib/billing/lemonPaymentLifecycle.ts`
- `src/lib/billing/lemonSubscriptionRefund.ts`
- `src/lib/billing/lemonSubscriptionWebhook.ts`
- `src/lib/billing/lemonWebhookIngress.ts`
- `src/lib/billing/lemonWebhookProductionScope.ts`
- `src/lib/billing/lemonWebhookSignature.ts`
- `src/lib/billing/lifecycle.ts`
- `src/lib/billing/vipCommercialConfig.ts`
- `src/lib/billing/tests/billingManagement.test.ts`
- `src/lib/billing/tests/commercialIdentity.test.ts`
- `src/lib/billing/tests/lemonBillingCustomerRpc.test.ts`
- `src/lib/billing/tests/lemonPaymentLifecycle.test.ts`
- `src/lib/billing/tests/lemonPersistence.test.ts`
- `src/lib/billing/tests/lemonSubscriptionRefund.test.ts`
- `src/lib/billing/tests/lemonSubscriptionRefundRpc.test.ts`
- `src/lib/billing/tests/lemonSubscriptionWebhook.test.ts`
- `src/lib/billing/tests/lemonSubscriptionWebhookRpc.test.ts`
- `src/lib/billing/tests/lemonWebhookIngress.test.ts`
- `src/lib/billing/tests/lemonWebhookProductionScope.test.ts`
- `src/lib/billing/tests/lemonWebhookReceiptRpc.test.ts`
- `src/lib/billing/tests/lemonWebhookScopeRpc.test.ts`
- `src/lib/billing/tests/lemonWebhookSignature.test.ts`
- `src/lib/billing/tests/subscriptionLifecycle.test.ts`
- `src/app/api/webhooks/lemon-squeezy/route.ts`
- `src/lib/auth/tests/commercialAccessRpc.test.ts`

The nine historical migrations below are preserved byte-for-byte. No migration is
applied and no financial data is queried or mutated by release tooling. No
financial/customer/transaction record is deleted. Legacy fields in the retained identity contract remain
compatible with the existing schema; no identity request calls a removed payment
module or commercial resolver.

- `supabase\migrations\202609110001_identity_access.sql`
- `supabase\migrations\202609120001_lemon_persistence.sql`
- `supabase\migrations\202609120002_lemon_webhook_receipt_rpc.sql`
- `supabase\migrations\202609120003_lemon_subscription_webhook.sql`
- `supabase\migrations\202609120004_lemon_subscription_refund.sql`
- `supabase\migrations\202609120005_lemon_commercial_access.sql`
- `supabase\migrations\202609150001_lemon_billing_customer_rpc.sql`
- `supabase\migrations\202609150002_lemon_webhook_scope_rpc.sql`
- `supabase\migrations\202609150003_lemon_payment_lifecycle.sql`

The original security release and retirement audit are historical records. Current
runtime boundaries are documented here and in `free-only-mode.md`.

## Validation and release evidence

Local release verification on 2026-10-23:

| Check | Result |
| --- | --- |
| `npm run lint` | Passed; one pre-existing article `<img>` warning |
| `npm run typecheck` | Passed |
| `npm test` | 108 passed across 42 files; no failures or skips |
| `npm run build` | Passed; 110 static pages generated |
| Built-server HTTP checks | 230 passed, including three real article links, RSS, both sitemaps, catalog canonicals/robots, redirects and retired APIs |
| API boundary checks | Six passed; malformed newsletter input rejected, unconfigured privileged endpoints fail closed, retired webhook returns 410 |
| Production dependency traces | 49 checked; zero include `@sanity/cli` or `typeid-js` |
| `npm audit --json` | Zero Critical/High; four unchanged Moderate package entries from the existing UUID advisory; expected exit code 1 |
| Historical migrations | All nine SHA-256 hashes unchanged |
| Dependency manifest and lockfile | Unchanged from the security release |

The Moderate exception remains the exact same `sanity` → `@sanity/cli` →
`typeid-js` → `uuid` chain and advisory
[GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq).
It is absent from production request traces. The patched Next.js and
eslint-config-next 16.4.2, Sharp 0.35.5, DOMPurify 3.4.17 and Undici versions
from the preceding release are preserved. No new serious vulnerability was found.

Automated Edge browser checks passed for both pages at 360, 390, 768, 1024
and 1440 px: no horizontal overflow or escaped content, no JavaScript page
errors, visible keyboard focus, working mobile menu/Enter/Escape and catalog
search/clear. Real editorial images loaded. Screenshots were also inspected
visually at mobile, tablet and desktop sizes, including the expanded mobile menu.
The in-app browser was unavailable; these checks used installed Microsoft Edge
through an isolated, ignored Playwright harness, without changing project
dependencies.

A separate local production smoke check at 390 px with 4× CPU throttling observed
first contentful paint of 1,320 ms for the homepage and 1,552 ms for the catalog,
with approximately 148–149 KB transferred JavaScript and no page errors. This is
a local measurement, not a Lighthouse score, network simulation or guarantee for
a particular device. The visual design adds no animation library or large hero
image. Build concurrency was limited locally for this machine and the original
Next.js configuration was restored byte-for-byte.

Authenticated sign-in delivery, newsletter signup/delivery and financial writes
were not exercised against live services. Existing isolated auth, newsletter,
Sanity, article sanitization and security tests remain in the complete suite.
The build still reports the existing Edge runtime deprecation notice.

Local command, browser, route, audit and post-push deployment evidence is kept
under `.verification/platform/`. Production acceptance requires Vercel `READY`
for the resulting commit and direct checks of the actual new content on both
public domains, including navigation and article links.
No DNS, Vercel hosting configuration, Docker setup, production secret or database
schema change is part of this release.
