# Newsletter confirmation safety fix

24 October 2026. Local-only remediation of the confirmed Stockholm readiness finding. Branch `master`; HEAD remains `dea9254fb82b90076671d58e884dd58ba61eb1eb`. No commit, deployment, provisioning, production configuration change, real subscriber access or email occurred. Existing verified backups were preserved.

**PASS — the focused local confirmation safety fix and all required local checks passed. Live activation remains BLOCKED by the outstanding release gates.**

## Root cause and affected path

1. Website `src/app/api/newsletter/confirm/route.ts`: GET renders a scanner-safe form; POST calls `managementPost(..., "confirm")` in `src/lib/newsletterAws/bridge.ts`, which authenticates the server bridge and forwards a capability. These files were inspected and remain unchanged.
2. SAM HTTP API POST `/confirm` invokes `src/handlers.api`, which calls `createService(...).api` in `services/newsletter/src/service.mjs`.
3. The original service branch verified the capability and pending nonce, checked provider suppression, then called `store.confirm(id, nonce, time)` without registration/confirmation approval. Already-confirmed tokens also returned success.
4. The original adapter in `services/newsletter/src/aws.mjs` atomically changed `PENDING` to `CONFIRMED`, set `confirmedAt`, created `unsubscribeNonce` and `audienceKey`, and inserted consent audit. It did not condition the write on `CONTROL`, and retained the confirmation nonce. `audienceKey` exposes a confirmed record to the audience GSI; the existing stream can mirror consent into the SES contact list.

Consequently, disabling email sending did not prevent an already-issued confirmation link from activating consent. Merely adding an earlier read would leave a race between the read and the write.

## Focused implementation

- Added `assertConfirmationAllowed`: runtime `REGISTRATION_ENABLED`, `CONFIRMATION_ENABLED`, `LEGACY_DISPATCH_RETIRED`, `COMPLIANCE_APPROVED` must each be the exact string `"true"`. Durable `registrationEnabled`, `confirmationEnabled`, `legacyRetired`, `complianceApproved`, `migrationComplete` must each be boolean `true`. Missing, false and malformed values deny activation. Migration/suppression readiness is an approval gate even for an empty launch; it never authorizes or automatically performs an import.
- The service checks those approvals and accepts only `PENDING` records. Consumed or already-confirmed links no longer receive a successful confirmation acknowledgement. Invalid, expired, wrong-purpose and revoked capabilities cannot activate consent.
- The persistence API is now `store.confirm(token)`. It independently obtains a strongly consistent control read, revalidates the original signed capability and expiry against server time after secret retrieval, and rechecks runtime flags immediately before dispatching the write. An internal caller cannot authorize activation merely by providing an ID/nonce/time or skipping the service gate.
- One DynamoDB transaction performs **three operations**: a `ConditionCheck` requiring all five current durable approvals; a conditional subscriber update requiring `PENDING`, matching nonce and absent suppression markers; an immutable audit insertion. The update removes `confirmationNonce`, making the capability single-use. Either all three succeed or none do. The API role receives only the additional table-scoped `dynamodb:ConditionCheckItem` permission needed for that check; no new sending permissions or resources were added.
- Conditional control rejection returns paused/unavailable; nonce/state/audit conditional rejection returns invalid link. Unknown storage/provider errors remain failures. There is no fallback activation write. A lost successful acknowledgement cannot produce a second activation: retries encounter a consumed nonce/state.

AWS documents transaction atomicity and serializable isolation with normal item writes, including concurrent control and suppression updates. These guarantees underpin the transaction design; local mocks are not proof of effective production IAM or managed-service behavior. [DynamoDB transactions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html), [transaction IAM](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis-iam.html).

Pause semantics: an approved operator must persist the durable registration/confirmation pause **before** updating Lambda environment configuration. A transaction serialized before that pause may already have committed; a transaction serialized after the durable pause cannot pass its condition. Environment configuration updates alone cannot atomically revoke already-running Lambda invocations. No pause operation or control write was performed here.

## Preserved behavior

Unsubscribe, durable suppression, bounce/complaint feedback and contact opt-out synchronization remain independent of activation/delivery flags. Suppression committed before activation prevents it; suppression committed after activation removes audience membership and wins final state. No public reactivation or suppression-clearing path was introduced. Provider events that have not yet reached the ledger still require the existing feedback/reconciliation process; this transaction does not make SES and DynamoDB one atomic service.

Digest sending can stay disabled while enrollment is separately approved. All five infrastructure parameters still default false; SES configuration-set sending, Scheduler and dispatch mappings remain disabled by default. No subscribers, contacts or `CONTROL` item are seeded; no migration/import runs automatically. The website signup pause and retired legacy dispatch routes remain unchanged.

## Changed files

| File | Change |
| --- | --- |
| `services/newsletter/src/domain.mjs` | Strict confirmation-activation gate |
| `services/newsletter/src/service.mjs` | Gate confirmation, require pending state, pass original token to persistence, reject replay |
| `services/newsletter/src/aws.mjs` | Boundary revalidation; atomic control/subscriber/audit transaction; consume nonce |
| `services/newsletter/template.json` | API-only ledger-scoped ConditionCheckItem permission |
| `services/newsletter/test/confirmation.test.mjs` | New focused handler/adapter/concurrency/suppression/clean-launch regressions |
| `services/newsletter/test/fixture.mjs` | Synthetic durable confirmation approval and single-use adapter contract |
| `services/newsletter/test/system.test.mjs` | Replace the old replay-success expectation with single-use rejection |
| `services/newsletter/test/adapters.test.mjs` | Move confirmation assertions to the dedicated boundary/transaction tests |
| `services/newsletter/README.md` | Activation gates, single-use capability and pause semantics |
| `docs/newsletter-aws-owner-guide-2026-10-24.md` | New durable confirmation field, strict approval values, safe pause order |
| `docs/newsletter-aws-stockholm-deployment-readiness-2026-10-24.md` | Link local remediation while retaining original audit evidence |
| `docs/newsletter-confirmation-safety-fix-2026-10-24.md` | This report |

No unrelated website/authentication/contact/article/SEO source, dependencies, credentials or scheduling defaults were changed.

## Verification evidence

Evidence directory: `.verification/newsletter-confirmation-safety-20261024-133114Z/`. Before editing, `before.zip` preserved the ten existing files in scope; every entry was read back and matched to its original bytes. Before hashes and Git status are retained. The new test and this report did not previously exist.

Focused regressions exercise strict missing/false/malformed runtime and durable values, existing valid pending links during a pause, direct adapter bypass attempts, a durable pause after the strong read, control deletion/malformed approval at the transaction boundary, nonce revocation, expiry during asynchronous validation, signature/purpose rejection, consumed-token replay, twelve simultaneous handler requests, twelve simultaneous adapter transactions with one audit, both orders of suppression/confirmation, and unchanged opt-out processing while every flag is off. The SDK-command model evaluates the generated conditions before applying writes; it uses synthetic in-memory records only. No AWS connection, email adapter dispatch, production key or subscriber record is needed by these new cases.

| Check | Result |
| --- | --- |
| Newsletter regression suite | **66 passed**, zero failures/skips; `newsletter-final.log` |
| Exact audited failure reproduced after fix | **503 / PENDING**, nonce preserved, zero audit writes and email-adapter calls with all flags false and CONTROL absent; `audit-reproduction-after.json` (original audit recorded 200 / CONFIRMED) |
| Backend syntax and infrastructure safety invariants | PASS; `newsletter-final-syntax.log` |
| Website newsletter route regressions | **4 passed**, zero failures/skips; `website-newsletter-routes.tap` |
| Full website/service lint | Exit 0; one existing article `<img>` warning; `lint.log` |
| Final focused runtime/test lint | Exit 0, no diagnostics; `focused-final-lint.log` |
| Next route type generation + `tsc --noEmit` | Both exit 0; `typecheck-results.json` |
| Next production build | **Exit 0; 116/116 pages generated**; `build-public-content.log`, `build-public-result.json` |
| CloudFormation lint, eu-north-1 | `cfn-lint 1.58.0`, exit 0, no diagnostics; `cfn-lint-result.json` |
| Scope/preservation | All 194 website source/public asset files match the isolated verification copy; dependency manifests, Vercel settings, TypeScript/ESLint configuration unchanged; template delta is only the API ConditionCheckItem grant; `preservation-review.json` |

The backend is plain JavaScript: syntax, lint and behavioral SDK-mock tests cover it; the application TypeScript check is not represented as full static typing of the Lambda service. Website lint/build and typecheck run in separate isolated mirrors with sanitized environments and no copied environment/credential files. Build-only worker count is one in the build mirror; root `next.config.ts` and existing `.next` output are preserved. Tests and typegen/typecheck block Node networking/environment-file reads. The final build harness permits only exact compiler loopback IPC and anonymous GET requests matching 15 reviewed public-content query patterns from existing article/category/page code, on the existing project's Sanity query endpoint; authorization/cookie headers, mutations, subscriber queries, redirects and other destinations remain blocked. A separate pure guard self-check passed the approved article query and rejected nine unsafe request variants without making a connection. Public editorial reads or cached content do not access newsletter subscribers. AWS credentials/config lookup and networking are disabled for CloudFormation validation. No production subscriber or email test was substituted for a local check.

An initial new feedback regression omitted the synthetic SES event's destination field. The fixture was corrected without changing feedback code; the final complete suite passes. No failed check is being counted as a pass.

The first build attempt failed because the test guard also blocked Turbopack's local compiler IPC; the second compiled and passed TypeScript but the guard blocked the site's existing public CMS reads. I corrected only the ignored verification harness and reran the normal production build successfully. Both failed logs/results are retained (`build.log`, `build-result.json`, `build-with-compiler-ipc.log`, `build-retry-result.json`). Build output also contains the isolated mirror's multiple-lockfile/workspace-root warning; production configuration was not changed to suppress it. The final passing build and preservation checks are recorded separately in `final-verification-summary.json`.

## Remaining activation blockers

The confirmed code defect is the only implementation scope of this change. Remaining gates from the Stockholm report still apply: owner-approved dedicated secrets/private mailing-address entry, account/role/name/quota preflight, reviewed disabled provisioning/change set, isolated managed-service/IAM/transaction/stream/feedback tests under separate approval, historical suppression and unsubscribe recovery, containment of old deployments/schedulers/webhooks and outstanding feedback retries, legal/privacy/retention approval, operational alert ownership and daily quota headroom. No local change disables an old deployed version.

Future control configuration must include **boolean `confirmationEnabled`**; omission fails closed. Keep it and all other enable fields false until the relevant approval. Do not invent or rotate keys, seed an audience, import legacy subscribers, or set `migrationComplete` merely to bypass this gate. Zero active subscribers remains the launch policy. Deployment and any real-email test still require explicit owner approval.
