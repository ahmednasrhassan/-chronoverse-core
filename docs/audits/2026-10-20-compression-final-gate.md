# Final compression optimization gate — 2026-10-20

> Historical offline fixture evidence, prepared for publication after the compression change was published. Test counts, timings, and review conclusions below describe the original gate, not a new test run or production CPU measurement. The level-6-first encoder with level-9 size fallback is now the published implementation; candidate and baseline retain their historical meanings.

## Historical recommendation

**Safe to approve as a modest cache-write optimization, with an explicit fallback cost tradeoff.** This is not a demonstrated production Active CPU or billing reduction. Cache-hit cost is unchanged. The candidate is most useful when writes resemble the configured FX fixture and remain comfortably below the transport cap. If near-limit writes are common, the two-pass fallback can erase the savings; production frequency is unknown.

No runtime defect was found in the reviewed eight-line compression diff. The original regression covered fallback with a stubbed compressor; this gate fills the missing real-size and compatibility coverage. The runtime candidate was left unchanged during that review.

## Baseline, scope and independent diff review

Historical level-9 baseline commit: `aa323e20b7d41a242497c420f1e38faa26ef0a65`. This identifies the source compared in the gate, not the current repository HEAD.

The runtime diff reviewed at the gate was seven added lines/one removed line in `src/lib/markets/services/canonicalProductResultQualification.ts`: use level 6 first, retry level 9 if base64 exceeds 1900000 characters, then enforce the same rejection guard. Neither `src/proxy.ts` nor authentication, billing, source providers, market engines, TTLs, cache namespaces, provenance, admission or freshness rules changed.

The gate loads the actual baseline source using `git show`, not a hand-written or string-restored surrogate encoder. Baseline and candidate use identical in-memory TypeScript compilation settings and unchanged dependencies. A separate final review traced the producer handoff and all error exits, and reviewed the additional regression/benchmark code. Cache producers still return the encoder result only after it has passed the final size check; encoding failure rejects before a framework cache can receive it.

The decoder overloads, decoder implementation and all following validation/parser/provenance helpers are byte-identical to baseline. SHA-256 of that identical source suffix: `f9e5f91acee054bd366317e0e7e306d80eb26d11b8ad060340f43730dbeb4f73`. The earlier constants and passive snapshot entry point are also unchanged in the exact diff.

## Equivalence and compatibility

Seven deterministic cases were compared against the actual baseline: small ESTR (220 observations, negative zero and RP/CM sidecars), configured FX (four x 600), medium FX (four x 900), large FX (four x 10000), two near-limit entries and one oversized entry.

For every accepted case, the gate verified:

- **Byte-for-byte identical decompressed tagged canonical UTF-8 payloads**, as well as deep decoded graph equality, including undefined/nonfinite values, negative zero and null-prototype extensions.
- Full source histories, provenance, source timestamps, original evaluation cutoffs, qualification receipts and canonical source-binding digests retained without modification.
- Free and VIP projections, including delivery assessment/freshness, identical at three fixed delivery times.
- Old level-9 transports readable by the new decoder; new transports readable by the baseline decoder (rollback compatibility).
- Each transport's checksum equals the unchanged SHA-256/domain-tag calculation for its actual compressed body. **Compressed-body checksums may differ between compression levels; source-binding digests and decompressed canonical bytes do not.**
- Base64 body <= 1900000 characters; tagged payload <= 16 MiB; a serialized Next FETCH cache envelope < 2 MiB. Node, depth and element limits remain unchanged.
- Corrupt checksums reject with the same baseline error details for old and new entries. Existing malformed/prototype/accessor/UTF-8/trailing-data/resource-limit/source-mismatch tests still pass.

## Real storage-boundary results

Near-limit fixtures add deterministic passive analytical-result extension data. This stresses compression without replacing the source context, source receipts, timestamps or engine calculations. The seeded generator and binary search are in `scripts/benchmarks/compression-final-gate.mjs`; seed `0x6d2b79f5`, boundary padding length 1817930 characters on Node v24.18.0.

| Case | Level-6 base64 chars | Level-9 base64 chars | Result |
| --- | ---: | ---: | --- |
| Near limit, both fit | 1875864 | 1873992 | One level-6 compression; accepted |
| Actual fallback | 1901856 | **1900000** | Level 6 exceeds cap; actual level 9 fits exactly; accepted losslessly |
| Oversized | 1926296 | 1924420 | Both exceed cap; rejected; zero simulated cache handoffs |

The oversized candidate and actual baseline produced identical error name, message and result (`CanonicalProductResultQualificationErrorV2`, `invalid-cache-payload`, unchanged policy/missing fields). The framework handoff was simulated locally, not a production persistence experiment. Source inspection and existing injected producer/cache tests establish that errors occur before a persisted result is returned.

Failure-policy claim: validation, storage caps, typed rejection details and producer rejection-before-write are preserved. Compressed representations are intentionally different; these tests are not a mathematical proof that all possible byte strings produce identical size-threshold outcomes at two different zlib levels. In particular, compression levels are not a universal ordering guarantee. Every returned candidate must still satisfy the unchanged size and integrity policy.

## Paired CPU and output-size measurements

Raw results: `scripts/benchmarks/compression-final-gate-results.json`. Windows, Node v24.18.0, Intel i5-5200U 2.20GHz. Offline injected sources/lifecycle callbacks, blocked network fetch, no production access. Three warmups; 20 paired iterations for small/configured/medium cases, eight for large/boundary cases; pair order alternates each iteration. Baseline/candidate are transpiled identically. Both process CPU and wall median/p95 are retained. Windows CPU accounting is quantized; very small differences are noise-sensitive.

| Case | Pure compression level 9 / 6 CPU ms | Full baseline / candidate encode CPU ms | Level-9 / level-6 base64 chars | Candidate path |
| --- | ---: | ---: | ---: | --- |
| ESTR 220 | 1.60 / 1.55 | 26.65 / 17.90 | 6176 / 6276 | 6 |
| FX four x 600 | 13.30 / 4.70 | 46.85 / 43.00 | 49244 / 50736 | 6 |
| FX four x 900 | 15.60 / 7.05 | 71.05 / 60.95 | 69488 / 71424 | 6 |
| FX four x 10000 | 164.13 / 56.50 | 781.25 / 617.13 | 671252 / 691228 | 6 |
| Near limit, both fit | 103.50 / 72.25 | 170.13 / 154.13 | 1873992 / 1875864 | 6 |
| Accepted fallback | 130.63 / 101.75 | 160.13 / 259.75 | 1900000 / 1901856 | 6 then 9 |
| Oversized rejection | 85.88 / 84.00 | 156.00 / 246.38 | 1924420 / 1926296 | 6 then 9, reject |

For configured FX, full encoder CPU improved **3.85 ms (8.2%)** and body size increased **3.0%**. The paired measurement is more conservative than the prior audit's unpaired full-encoder comparison; the original evidence has been preserved rather than overwritten. The small ESTR compression-kernel difference is negligible at this clock resolution; its larger full-encoder difference should not all be attributed to zlib. JIT, GC and hardware variability affect full-encoder comparisons.

The accepted near-limit fallback added **99.63 ms (62.2%)** to a full write versus baseline. Oversized rejection added **90.38 ms (57.9%)**. Retry also adds transient compression/string allocation. This is an explicit bounded tradeoff, not a savings claim for boundary cases.

Observed fallback frequency: **0/4 representative fixture types**, **2/3 intentionally constructed boundary types** (one accepted fallback, one rejected). Each deterministic type takes the same path on repeated encoding. These proportions are **not** request-weighted or production frequency estimates. Actual cache-miss rate, entry-size distribution, fallback frequency and billing impact remain unknown; production observability was unavailable in the preceding audit. With a 24-hour canonical result revalidation interval, savings could be immaterial if writes are infrequent.

## Regression additions and final checks

Two new tests were appended without replacing the existing regression work:

1. Exact canonical bytes, level-9 compatibility, source/receipt graph equality and Free/VIP freshness parity at three assessment instants.
2. Real seeded near-limit zlib fallback at the actual bound, full decoded equivalence, Next envelope size and zero handoffs after an oversized producer rejection.

Focused **68/68 passed** (40.95 seconds); relevant nonduplicated broader **275/275 passed** (61.66 seconds): **343 total, zero failures or skips**. TypeScript, changed-file ESLint and `git diff --check` passed. Exact commands:

```powershell
node --require next/dist/server/node-environment-baseline --import ./scripts/tests/server-only-preload.mjs --import tsx scripts/benchmarks/compression-final-gate.mjs
node --require next/dist/server/node-environment-baseline --import ./scripts/tests/server-only-preload.mjs --import tsx --test src/lib/markets/tests/services/canonicalProductResultQualification.test.ts src/lib/markets/tests/services/canonicalProductResults.test.ts src/lib/markets/tests/services/canonicalTemporalQualification.test.ts
node --require next/dist/server/node-environment-baseline --import ./scripts/tests/server-only-preload.mjs --import tsx --test src/lib/auth/tests/*.test.ts src/lib/billing/tests/*.test.ts src/lib/seo/tests/*.test.ts src/components/home/tests/*.test.ts src/components/navigation/tests/publicLaunchIntegrity.test.ts src/lib/markets/tests/services/canonicalTemporalAdmission.test.ts src/lib/markets/tests/services/fxTemporalProductionAdmission.test.ts src/lib/markets/tests/services/estrTemporalProductionAdmission.test.ts src/lib/markets/tests/services/vipDeepDelivery.test.ts src/lib/markets/tests/services/vipMarketRoomDelivery.test.ts src/lib/markets/tests/services/vipEstrMarketRoomDelivery.test.ts src/lib/markets/tests/services/ecbLiveProgressionRoute.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js src/lib/markets/services/canonicalProductResultQualification.ts src/lib/markets/tests/services/canonicalProductResultQualification.test.ts scripts/benchmarks/*.mjs
git diff --check
```

The original test transcripts and working-tree inventories were preserved in a private local archive during cleanup; they are not included in this publication candidate. No build was performed by the historical gate: the actual codec, producer/cache integration, full-history, temporal, auth, billing, proxy, homepage and indexing contracts were exercised directly.

## Publication context

This report preserves the original offline measurements and historical verification commands. It does not certify current deployment health, production fallback frequency, Active CPU savings, billing changes, or migration readiness. The published `compression-final-gate.mjs` and `compression-final-gate-results.json` retain the paired final-gate evidence; `canonical-cache-cpu-results.json` preserves the earlier exploratory measurements with separate methodology caveats.
