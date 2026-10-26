# Phase 1: newsletter P0 remediation

24 October 2026 · Chronoverse Capital · local changes only

Baseline: `master` at `dea9254fb82b90076671d58e884dd58ba61eb1eb`.
Scope: A01/A02 from the [post-release audit](./post-release-quality-audit-2026-10-24.md) and its [evidence](./post-release-quality-audit-2026-10-24-evidence.json).

## Status and deployment decision

Implementation is local. No production settings, subscriber records or published articles have been changed. No emails, commits, pushes or deployments were performed. The existing audit documents, ignored verification evidence, `.env.local` and backup were preserved.

**Production unsubscribe recovery still requires configuration work under separate owner approval.** Code cannot decrypt previously issued capabilities without their original signing/encryption secret, and it cannot persist opt-outs without an appropriately scoped Sanity writer. A malformed-link 400 is not proof that valid production opt-outs now work.

**Deployment recommendation: hold full P0 release sign-off until the owner verifies/recovers the original unsubscribe key and scoped writer configuration.** The local code is ready for review and passes the required checks. It can enforce a sending stop in a deployment containing this revision, but it cannot establish that production opt-outs work with missing/unverified credentials or that older deployments are disabled. No deployment is authorized by this report.

## Root causes and fixes

### A01: unsubscribe availability

The audited GET/POST handlers evaluated `unsubscribeSecret()` before checking even the token's syntax. Its precise failure condition is an absent `NEWSLETTER_UNSUBSCRIBE_SECRET` or a value shorter than 32 UTF-8 bytes. The token decoder catches its own crypto failures, so the audit's custom 503 response isolates the configuration guard for that revision; production values were not inspected, so absent versus too-short remains unconfirmed there.

A metadata-only check of local `.env.local` found no declarations for `NEWSLETTER_UNSUBSCRIBE_SECRET`, `SANITY_NEWSLETTER_READ_TOKEN` or `SANITY_NEWSLETTER_WRITE_TOKEN`. Values were not printed, copied into tests or altered. This establishes local missing prerequisites, not the actual production environment.

Changes:

- Malformed/missing capabilities now return 400 before requesting a secret or constructing any storage client. The exact existing v1 format check is shared with the authenticated decoder.
- A valid v1 capability still requires the original secret and AES-256-GCM verification. There is no default/generated key, plaintext-email alternative, unsigned opt-out, broad-token fallback or new reactivation path.
- GET is explicitly dynamic and non-mutating. With the original key, its confirmation page works even when sending, signup, AWS and all storage settings are absent or disabled.
- POST keeps existing browser-form and one-click query-token formats. It awaits the unchanged durable suppression transaction, which deactivates matching copies without creating a subscriber or removing suppression. No writer changes or migrations were introduced.
- Verification/storage outages return 503 with the published support address and wording that the request could not be **confirmed**. This also covers a committed transaction whose acknowledgement was lost; an idempotent retry is safe. Tokens, addresses, keys and provider exceptions are not exposed in errors or logs.
- Existing no-store, no-referrer, noindex and restrictive form/security headers remain.

This repairs request handling and preserves an independently available, tested opt-out path when its prerequisites exist. It deliberately does not pretend a missing historical key can be fixed by local code.

### A02: independent delivery suspension

The release paused signup in code, while dispatch relied on environment confirmations and enabled infrastructure. Disabled Vercel Cron scheduling did not remove direct authenticated requests, the Sanity publication webhook, or internal transport calls.

Changes:

- Added `NEWSLETTER_DELIVERY_PAUSED = true`, independent of `NEWSLETTER_SIGNUPS_PAUSED`. No environment variable, request body, query parameter or cookie can reopen it. Resumption requires a reviewed source change and release.
- Cron GET/POST retain authentication and then return a non-cacheable 503 with `code: newsletter_delivery_paused`, before configuration loading, audience reads, content loading or campaign creation. Next's automatic HEAD path also reaches the guarded GET.
- The Sanity webhook retains signature/source/freshness and publication/document validation. Valid non-publication events keep their existing 200/skipped behavior; a valid publication dispatch is paused before newsletter configuration or storage access.
- `getNewsletterConfig()` also checks the code pause, independent of its existing four confirmation flags.
- `deliverCampaign()` checks before any supplied dependency can be inspected, then rechecks within the recipient loop and immediately before transport handoff. A caller-supplied configuration or alternate transport does not bypass suspension.
- `sendNewsletter()` checks independently before configuration/message processing and SES SDK construction. Existing environment, recipient and unsubscribe-origin validation remains after the pause.
- Removed the newsletter schedule from the **local** `vercel.json` (`crons: []`). No production toggle was changed. The code guards enforce suspension even if an external scheduler or signed webhook continues calling.
- Opt-out, suppression feedback, authentication and contact workflows are outside this delivery gate.

## Dispatch inventory after remediation

| Path / call | Result while this source revision is paused |
| --- | --- |
| `/api/cron/send-newsletter` GET, POST and Next automatic HEAD | Authenticated calls get 503/paused before content, audience, ledger or SES work; unauthorized/missing-secret failures remain fail-closed |
| `/api/webhook/sanity` POST | Invalid authentication rejected; non-publication events skipped as before; valid publication dispatch gets 503/paused |
| `getNewsletterConfig()` | Throws `NewsletterDeliveryPausedError` even if every environment confirmation is true |
| `deliverCampaign(...)` | Throws before store/config/input access or caller-supplied transport invocation |
| `sendNewsletter(...)` | Throws before message access or SES construction; sole current SDK sending boundary |
| `/api/amazon` POST | Existing static, capability-free 410 handler remains unchanged; other unsupported methods do not gain a sender |
| `/api/newsletter` POST | Existing hardcoded signup pause remains; no address parsing, subscription creation or reactivation |
| `/api/newsletter/unsubscribe` GET/POST | Independent token verification and suppression remain available with their own prerequisites |
| `/api/newsletter/feedback` POST | Existing verified SNS bounce/complaint suppression remains independent of sending pause |
| RSS/feed, revalidation, Blogger-image and retired SEO webhooks | No direct newsletter sending call; source behavior unchanged |
| Account email OTP action | Separate transactional Supabase flow; source unchanged; exercised only with mocks, never sent |
| Contact | Existing mailto/support flow; unchanged; no contact form or mail dispatch was added |

Searches of current application/script source found two dispatch routes converging on one `SendRawEmailCommand` boundary, plus the internal campaign entry point. No additional current SMTP/SES sending script was found. Aliases and apps-host API paths serving this revision reach the same guards. External systems and older deployments are outside that source inventory.

## Changed files

Application/configuration:

- `src/config/newsletterAvailability.ts` — independent delivery pause.
- `src/lib/newsletter/availability.ts` — shared pause error/assertion/HTTP response.
- `src/lib/newsletter/config.ts` — configuration entry guard; unsubscribe-secret function stays independent.
- `src/lib/newsletter/delivery.ts` — internal campaign/pre-handoff guards.
- `src/lib/newsletter/transport.ts` — direct transport guard.
- `src/lib/newsletter/tokens.ts` — reusable preflight syntax check; v1 cryptography unchanged.
- `src/app/api/cron/send-newsletter/route.ts` — authenticated paused dispatch.
- `src/app/api/webhook/sanity/route.ts` — verified publication pause, preserving skipped-event behavior.
- `src/app/api/newsletter/unsubscribe/route.ts` — syntax-before-config handling and truthful recoverable failures.
- `vercel.json` — remove future declared newsletter scheduling.

Regression tests:

- `src/lib/sanity/tests/newsletter-pause.test.ts` — actual paused routes, all-enabled configuration, alias/method/query/cookie/environment bypass attempts, direct internal calls, legacy inertness and manifest policy.
- `src/lib/sanity/tests/newsletter-unsubscribe.test.ts` — missing/short config, pinned historical-compatible v1 vector, scanner-safe GET, browser/one-click POST, no reader requirement, forged tokens, duplicate/inactive/manual suppression, unrelated-record preservation, writer failures, lost acknowledgements and retries.
- `src/lib/sanity/tests/newsletter-resume-fixture.ts` — isolated test-only module evaluation preserving the existing delivery/ledger regression suite under a simulated future reviewed resume. Production accepts no pause override or test injection.
- `src/lib/sanity/tests/newsletter-delivery.test.ts` and `newsletter-routes.test.ts` — use that fixture for the existing acceptance/partial-failure/deduplication coverage. New pause tests import the real production modules directly.

Documentation: this report. The two pre-existing untracked audit artifacts remain unchanged. No auth, contact, public article, P1/P2/P3 component, dependency, lockfile, migration, financial ledger or subscriber schema was changed.

## Verification

Every newsletter/auth regression process receives only OS/tooling environment variables, explicitly synthetic fixture settings, the existing server-only test adapter and the network/environment-file denial preload. Sanity SDK calls are redirected to in-memory documents; SES is mocked. Synthetic transport acknowledgements in retained ledger tests are not real emails. Signed SNS tests use generated local keys and a stub certificate loader, not AWS endpoints.

The first retained-suite run exposed a test-harness import timeout; its bounded VM initialization timeout was adjusted. A broader regression run exposed the non-publication webhook response change, which was fixed in the route rather than weakening that assertion. Neither failure caused network/service access. Final verified results supersede those initial runs.

Typecheck/build use an isolated copy at `.verification/phase1-p0-1792827647034/workspace`, with identical final `src` files and package/config inputs, except temporary `experimental.cpus=1` for build concurrency. It has no `.env` files, `.vercel` state or inherited service credentials. Installed dependencies are shared via a junction; none were installed or changed. The tracked `next.config.ts` and existing root `.next` output remain intact. Source hashes are retained to verify mirror equivalence.

Verification logs and command statuses are under `.verification/phase1-p0-1792827647034/`. This directory is ignored and was newly created; earlier verification logs were not overwritten.

| Check | Final result |
| --- | --- |
| Newsletter + webhook hardening suite | **44 passed**, zero failures/skips/cancellations across seven files (`focused-gate.tap`) |
| Pinned v1 capability regression rerun | **8 passed**, zero failures/skips/cancellations after pinning the historical-format vector (`unsubscribe-compatibility.tap`) |
| Auth, inert legacy-email and public newsletter UI boundaries | **41 checks passed** in the broader boundary run. Its one initial hardening failure was the skipped-event contract described above; that exact hardening file passed in the final 44-check suite. No auth/contact source was changed (`boundary-regressions.tap`) |
| `npm run lint` | **Exit 0**, zero errors; existing article `<img>` warning only (`lint-gate.log`) |
| `npm run typecheck` | **Exit 0**, route types generated and `tsc --noEmit` passed (`typecheck-gate.log`) |
| `npm run build` | **Exit 0**, Next.js 16.4.2/Turbopack, TypeScript passed, **115/115 pages generated**, 390.8 seconds with one worker (`build.log`, `build.json`) |
| Compiled-server local HTTP smoke | **19 passed**, zero failures; authenticated Cron GET/POST/automatic HEAD and signed publication requests stay paused on apex/apps/preview host headers; unsigned Cron rejected; legacy POST inert/GET unsupported; signup paused; invalid opt-out GET/POST rejected; pinned valid opt-out GET confirms (`http-smoke.json`) |
| Source equivalence / preservation | All **205 mirrored source files** match final workspace hashes; mirror has zero `.env` files; tracked config only differs in the mirror's temporary worker limit; HEAD remains baseline |
| `git diff --check` | Passed |

The compiled-server smoke bound only to `127.0.0.1` on an ephemeral port, used synthetic settings and a network-denying server preload, and was stopped afterward. It deliberately did **not** make a valid unsubscribe POST. Actual persistence is covered by in-memory SDK fixtures, not a production database or synthetic write to a production dataset.

The build's additional warning concerns its nested verification copy and multiple lockfiles; it is not a repository configuration change. The first command-output wrapper encountered a Windows console-encoding error after the underlying lint/typecheck commands had exited 0; final command capture was corrected and the recorded gate runs both exited 0. No dependency/security acceptance was changed.

## Production requirements and risks local code cannot resolve

1. **Recover/verify the original `NEWSLETTER_UNSUBSCRIBE_SECRET`**, at least 32 UTF-8 bytes, in the intended deployment environment. Do not replace it with a random value to satisfy validation. Losing/changing it invalidates old encrypted links; recovery or an explicitly designed key-compatibility process needs separate approval. No key was generated or configured here.
2. **Verify `SANITY_NEWSLETTER_WRITE_TOKEN` and least-privilege ACLs** for durable suppression and deactivating existing duplicate/legacy subscriber documents. GET confirmation needs no Sanity token. Unsubscribe POST uses the writer, not the dedicated reader or a general admin token. Provider permissions/persistence were not tested on real records.
3. Keep `NEWSLETTER_SENDING_ENABLED=false` as additional defense; do not enable the identity/sender/feedback gates to repair opt-out. The new code pause rejects dispatch even if these values are accidentally true in a deployment containing it.
4. Under separate access/approval, inventory historical immutable deployments, aliases, old `/api/amazon` implementations, external schedulers, webhook destinations/retries and other hosting copies. Local changes and a future new deployment **do not disable old deployed versions**, revoke their secrets or cancel already accepted/in-flight mail.
5. Confirm the effective Cron state after any approved release. The local schedule is removed, but the current deployed configuration was not changed. Paused publication requests return retryable 503; queued provider retries and ledger outcomes require review before any future resumption.
6. Preserve unsubscribe and verified feedback while tightening sending access. Do not delete campaign/suppression ledgers, bulk-update subscribers or rotate the unsubscribe key as a shutdown shortcut. Inspect configuration/permissions without retrieving subscriber records; any controlled production mutation requires separate approval.
7. Before full P0 closure, verify deployed route behavior, the original-key compatibility evidence and scoped storage configuration through authorized access. This task does not authorize a real opt-out write, email, webhook invocation or subscriber inspection in production.

Deployment remains subject to owner approval. A successful local build and a code pause are not a claim of restored production opt-out persistence or safety of historical deployments.
