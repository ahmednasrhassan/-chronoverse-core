# Legacy market and VIP retirement — 23 October 2026

## Git scope and recovery

Work continues on `cleanup/retire-legacy-market-tools-20261023`, starting at
`7536b94`, after fetching origin. The initial cleanup commits remain in history.
The fetched publication baseline is `f3dd0e0` (`origin/master`).

The original directory, on `infra/container-readiness-2026-10-21`, contains
uncommitted work. It was left untouched. Implementation and verification use
`E:/chronoverse-app/chronoverse-legacy-cleanup`. A detached checkout at
`E:/chronoverse-app/chronoverse-cleanup-baseline` confirms pre-existing failures.
No reset, force update, master push, merge, deployment or external mutation was performed.

Every deleted file was tracked at the starting commit. The removed paid archive,
including its manifest, is recoverable with `git show 7536b94:<path>`. For a path
removed by an earlier cleanup commit, use `git show f3dd0e0:<path>`. Git objects
and history have not been pruned or rewritten.

- [Files deleted by this completion](legacy-cleanup-removed-files.txt).
- [All files deleted across this cleanup branch relative to f3dd0e0](legacy-cleanup-branch-removed-files.txt).
- [Every retained declared npm dependency and compatibility file, with reasons](legacy-cleanup-retained-dependencies.json).

## Removed features

- EUR/USD, EUR/JPY, EUR/GBP, EUR/CHF and €STR Free Lite presentation, current-use
  components, product registry, projections and product analytics.
- The orphaned market stack: provider acquisition, analysis and calibration,
  state, event/calendar, policy, engine, caches, temporal qualification,
  persistence clients, diagnostics, benchmark fixtures, tests and market-only
  Eurostat/R2 backup code. Import tracing found no retained editorial or account
  consumer. Older gold/oil engine modules were also orphaned behind existing
  retirement responses; their inactive dependencies are removed with the stack.
- VIP overview and market-room routes/layout, pricing, premium and sponsorship
  presentation, dormant homepage promotions, plan selection, checkout/portal
  provider services, outbound checkout identity construction and subscription UI.
- VIP-only authorization and account membership composition. Publication identity
  no longer queries commercial configuration, subscription RPCs, or billing data.
- Paid source archives and archive-presence tests. Old benchmark reports can be
  recovered from history rather than maintained as active product documentation.
- Unused legacy article-chart symbol detection. Editorial content itself is unchanged.
- Runtime packages `@aws-sdk/client-s3`, `echarts`, and `yahoo-finance2`.
  `fast-xml-parser` moves to development dependencies for retained RSS smoke checks.

## Public behavior and compatibility

Public copy, About, methodology, source/freshness guidance, FAQ, Terms, newsletter,
footer, default metadata, keywords, sitemap and `llms.txt` describe the research
publication. Financial disclaimers, customer rights, refund/dispute disclosures,
published research queries, category archives, RSS and Sanity schemas remain.
Tailwind sources are explicitly bounded to `src`, replacing the deleted archive
exclusion and avoiding sibling worktree scans during local verification.
See [Tailwind's source-path documentation](https://tailwindcss.com/docs/detecting-classes-in-source-files#setting-your-base-path).

| URL family | Behavior |
| --- | --- |
| `/markets` and descendants | Permanent redirect directly to `/reports`; query parameters preserved |
| `/intelligence` | Permanent redirect directly to canonical `/reports`, including on the www alias |
| `/research` | Permanent redirect directly to canonical `/reports`, including on the www alias |
| `/pricing`, `/premium`, `/vip`, `/sponsors`, including descendants/encoded forms | No-store, noindex 404 in proxy before session refresh or rewrite |
| Five `/api/markets/<id>/intelligence` routes | Inert 410, no-store, noindex; no authorization, acquisition, cache or provider capability |
| `/api/billing/checkout` and `/api/billing/portal` POST | Inert 410 with existing disabled error code; request body is never read |
| `/api/cron/ecb-live-progression` GET/POST | Inert 410; no provider or persistence capability |
| `/billing` | Historical one-time purchase support and receipt/contact guidance |

Root article slugs such as `/eurusd` are not treated as product aliases. No such
product route was found in Git history; inventing those redirects could shadow
editorial content. Regression coverage retains root articles discussing exchange
rates and interest rates in the sitemap.

Compatibility tombstones are deliberately retained as tiny handlers. They have
no imports from the deleted product stack and provide machine-readable retirement
responses rather than redirects from API clients into HTML pages.

## Retained boundaries

The dependency inventory names every retained billing/auth compatibility module
and migration. In particular:

- Sanity content, image handling, schemas, publishing hooks, replay protection,
  source verification and CMS tooling remain. Redis remains necessary for replay
  protection, independently of removed market caches.
- Newsletter signup, SES delivery and the existing newsletter cron are unchanged.
- Passwordless account identity, session refresh, subject-bound role validation,
  account actions and auth confirmation remain. Legacy database response fields
  and access types are retained for schema compatibility, not an active VIP product.
- Signed Lemon Squeezy webhook ingress, scoped receipts, historical customer and
  subscription facts, lifecycle/refund evaluators, payment handling, existing
  configuration identifiers and SQL migrations remain. They are not reused for
  an apps catalog. The old membership-to-site-access composition is removed.
- Existing Gumroad URL, Lemon store hostname, historical records and legal support
  obligations remain. No environment variable, payment configuration, table,
  production record, storage object or other external resource was deleted.
- `vercel.json` and all external DNS/Vercel arrangements, including
  `apps.chronoversecapital.com`, are unchanged. No catalog, app, plan or checkout
  was built or published.

Three pre-existing editorial packages (`marked`, `remark-math`, `rehype-katex`)
have no current direct source importer. They are explicitly identified in the
inventory and left outside this product-specific retirement. `styled-components`
is retained as a Sanity peer dependency. The regression runner now declares its
previously transitive `tsx` dependency directly for reproducibility.

## Verification and pre-existing failures

| Check | Final result |
| --- | --- |
| All retained unit/integration contracts | 116 passed across 58 test files; zero failures, skips, cancellations or deferred providers |
| Final public/redirect recheck | 50 passed, including canonical absolute destinations on apex and www |
| `npm run typecheck` | Passed: fresh Next route types and TypeScript |
| Next production build | Passed, exit 0: compiled in 7.2 minutes, TypeScript in 2.3 minutes, 124 static pages generated |
| Application/scripts ESLint | Passed: zero errors, one pre-existing article image warning |
| Whole-repository ESLint | Six pre-existing errors in unchanged `publish-article.js`; one pre-existing article `<img>` warning; no cleanup-introduced errors |
| Local production HTTP | 46 publication, redirect, retirement API, cron, RSS and sitemap checks passed |
| Local authenticated-family HTTP | Two checks blocked by missing Supabase public configuration in the isolated worktree, detailed below |
| Git recovery/protected paths | All 525 deleted blobs exist at 7536b94; protected CMS/schema/newsletter/webhook/deployment paths are unchanged |

Detailed counts and HTTP cases are in [the verification summary](legacy-cleanup-verification.json).
Raw local logs are ignored under `.verification/`.

The successful build used a temporary parent `turbopack.root` to permit linked
worktree dependencies and a single worker to fit this 4 GB machine. The override
was restored before committing. A normal checkout with `npm ci` uses the committed
configuration. The build also reports the pre-existing Edge Runtime deprecation
in the retained OG-image route.

Live `/account` and `/billing` checks on the local server return 500 because the
isolated worktree has no `NEXT_PUBLIC_SUPABASE_URL`. The unchanged session proxy
throws `AuthConfigurationErrorV1` before either page renders. No production
credentials were copied or altered. Auth, account, role validation, OTP/session
and historical billing contracts pass with fixture dependencies; real sign-in
and purchase-support session refresh still require the deployment's existing
Supabase public configuration. These two HTTP checks are explicitly blocked,
not counted as passes. No signup email, payment, refund or webhook transaction
was executed against production.

The dependency-lock audit reported 30 advisories (4 low, 7 moderate, 17 high,
2 critical). Automatic dependency upgrades were not performed. Existing locked
package versions were not upgraded; npm also normalized optional Tailwind WASI
transitive entries while removing the retired dependencies.

Supabase auth preservation was reviewed against the current
[server-side auth guide](https://supabase.com/docs/guides/getting-started/tutorials/with-nextjs)
and changelog. Existing claims verification, subject-bound role lookup and
cookie refresh remain; this task introduces no new Supabase feature or schema.


Baseline findings confirmed before cleanup or in the detached `7536b94` checkout:

- TypeScript imported an already-removed `/markets/page` from static metadata tests.
- Navigation, homepage, redirect and sitemap tests still required retired launch
  products or `/markets`, despite the initial cleanup commits.
- `lemonPersistence.test.ts` and `category-archive-policy.test.ts` failed because
  their literal source comparisons did not normalize Windows CRLF. Tests now
  normalize text; production migrations and category source are unchanged.
- Analytics tests used top-level await despite the CommonJS test transform. They
  now use a static import and test retained consent/page-view behavior.
- Whole-repository ESLint reports six existing `no-require-imports` errors in
  `publish-article.js`. That editorial publishing script is unchanged.
- Initial Turbopack validation rejected the worktree's linked `node_modules`
  because it resolves outside the inferred root. Local build verification uses
  the installed Next guide's parent-root setting temporarily; it is restored
  afterward and is not committed. No deployment configuration is changed.

The original financial suite is obsolete and is removed with the engines. An
initial baseline run of that suite was stopped; it is not reported as a pass.
The replacement runner discovers every retained `.test.ts`, `.test.tsx` and
`.test.mjs` under its explicit groups. It strips inherited service credentials,
blocks Node networking, and has no live-provider exclusions or skipped tests.
