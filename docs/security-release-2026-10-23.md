# Security release recovery — 2026-10-23

Recovered from cleanup commit `06b7e6719ce8aebc1f9d25c398427d16429ee04f` on
`master`. The interrupted installation had replaced some packages without updating
the tracked lockfile. The untracked article/RSS sanitization regression and local
verification evidence were retained. Existing npm cache content was reused;
incomplete Next.js/SWC and Sharp downloads were completed and checked against
registry SHA-512 metadata before caching. TLS and npm integrity checks remained enabled.

## Dependency changes

| Package | Previous lockfile | Verified installed version |
| --- | --- | --- |
| next / eslint-config-next | 16.3.4 | 16.4.2 |
| sharp | 0.35.4 | 0.35.5 |
| dompurify | 3.4.14 | 3.4.17 |
| undici, 6.x consumers | 6.28.0 | 6.28.1 |
| undici, 7.x consumers | 7.29.0 | 7.29.1 |
| vite | 8.2.2 | 8.2.4 |
| source-map-js | 1.2.1 | 1.2.2 |
| adm-zip | 0.6.0 | 0.6.1 |
| smol-toml | 1.5.2 / 1.8.0 | 1.9.1 |
| brace-expansion | 1.1.18 / 5.0.9 | 1.1.21 / 5.0.12 |
| js-yaml, 3.x consumers | 3.13.1 / 3.15.2 | 3.15.2 |

Next.js and its lint configuration remain aligned. The application has real
account Server Actions, so the [CPU-exhaustion advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r)
was production-reachable before this patch. Version 16.4.2 also removes all other
Next.js findings recorded in the baseline audit, including ImageResponse/image
optimization and typed-array cache RCE, SSRF, cache leaks and cache poisoning.

DOMPurify 3.4.17 addresses the recorded [template/shadow-root bypass](https://github.com/advisories/GHSA-cg2g-xh64-v4q7),
IN_PLACE/hook and XHTML/SMIL findings. Article HTML and RSS continue using the
existing sanitizer configuration. Sharp 0.35.5 fixes the recorded
[librsvg finding](https://github.com/advisories/GHSA-wq5f-xc86-pv6w);
its native SVG-to-PNG path was exercised locally. Undici overrides retain each
consumer's major version and remove the recorded WebSocket, retry, decompression,
cache and BalancedPool certificate-validation findings. Vite's remaining
development-server findings are addressed within the 8.2 minor version.

The proxy regression harness was updated for Next.js 16.4.2's additional
`getAssetPrefix` argument to `getResolveRoutes`; production proxy behavior is unchanged.

## Remaining advisory and installation notes

`npm audit --json` exits **1**, reporting **0 Critical, 0 High, 4 Moderate** package
entries. These four entries represent one advisory:
[UUID buffer bounds checking](https://github.com/advisories/GHSA-w5hq-g745-h8pq),
through `sanity -> @sanity/cli -> typeid-js@1.2.0 -> uuid@10.0.0`.
The affected UUID APIs are v3/v5/v6 with caller-supplied output buffers. The
installed TypeID implementation uses v7 and stringify. The root `typeid-js` is
consumed by the Sanity CLI; Sanity telemetry has its separate older TypeID line.
None of the 46 generated production dependency traces includes this CLI/TypeID
chain. This is a tooling dependency assessment, not a claim that npm audit is clean.
The proposed automatic remedy downgrades Sanity from 6.x to 5.14.1. No forced
downgrade or UUID major override was applied.

Installation commands completed successfully. `npm ls --all` separately reports
two pre-existing peer conflicts, also present in the recovered lockfile:
`@sanity/sdk-react@3.0.0` pins Workbench alpha.24 whose SDK peer expects 2.x,
and fdir's optional picomatch peer expects 3.x/4.x while the hoisted copy is 2.x.
These packages were not upgraded or suppressed in this remediation. The selected
security packages are installed, and no missing-package errors were reported.

## Verification

- `npm run lint`: pass; existing article `<img>` warning remains.
- `npm run typecheck`: pass.
- `npm test`: 117 passed across 57 files; no failures, skips or cancellations.
- `npm run build`: pass; 108 static pages. Temporary `experimental.cpus=1` and
  `RAYON_NUM_THREADS=1` limited local concurrency; the tracked config was restored.
  The existing OG Edge-runtime deprecation remains.
- 202 built-server HTTP checks: pass, including a published Sanity article,
  editorial indexes, RSS/feed alias, newsletter pages, account, apps host,
  canonical hosts, and retirement/proxy boundaries across methods and encodings.
- RSS response: valid XML with 50 items.
- Six additional ingress checks: malformed newsletter requests return 400;
  unauthenticated cron/revalidation/Lemon requests fail closed. Local configuration
  is absent for those three provider workflows (503/503/500 respectively), so these
  checks do not establish live provider delivery or persistence.
- All selected security dependencies match the lockfile, including all 18 Undici
  copies. `npm ls next eslint-config-next sharp dompurify undici vite --all --json`
  exits 0. The separate baseline peer conflicts above remain documented.
- `git diff --check`: pass. Release security criterion: zero Critical/High
  findings; the remaining Moderate CLI advisory is assessed above. Audit still exits 1.

Full local logs and registry integrity metadata are retained under
`.verification/security/` (ignored). Regression groups keep service credentials
out of their subprocesses and block networking. Retained Lemon Squeezy webhook,
subscription/refund/payment lifecycle and financial reconciliation functionality
remain intact; production commercial obligations are still unverified. No
production records, secrets, DNS or hosting architecture were changed.
