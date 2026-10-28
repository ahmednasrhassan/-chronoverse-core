# Newsletter Git synchronization review - 28 October 2026

The AWS deployment is successful. This review prepares **one approved Git source
synchronization**, with no Lambda/CloudFormation execution, package creation,
subscriber action, email, public registration or weekly activation. No commit or
push has been performed. The repository becomes the canonical source for the
completed application, infrastructure definitions, tests and sanitized operations.
Private deployment state remains separately preserved, not republished.

## Exact state and release relationship

- Current local HEAD and read-only remote master check both match
  `df57410cdd96e3922cc0c22d25613a867f44eb9e`.
- Existing original AWS release: `private-signup-repair-20261027-739404fe3d61`.
  Existing confirmation patch: `confirmation-post-fix-6ee620a8c933`.
- API archive SHA256: `638f813fa3682caf7ccdbac556e557b65928c036836ce5221337b65bdacca150`.
  Planner, Worker, Feedback and ContactSync each retain BASE archive SHA256
  `89636d5a22d004e9274a0a6190a46de1904a2c7516cfa70624f62845a3f258c8`.
- Completed user-confirmed live reconciliation: stack UPDATE_COMPLETE; recorded
  approved change set EXECUTE_COMPLETE with exact ID matching checkpoint and
  stack; all 11 authorizations/unqualified proxy targets and reviewed original/
  processed template checks passed. CONTROL is strictly false for registration,
  confirmation and delivery; both schedules are DISABLED. No AWS check was repeated
  for this Git preparation. Exact execution ID/state remains in private evidence.
- The [sanitized deployment manifest](../services/newsletter/deployments/deployment-reviewed-2026-10-28.json)
  records these facts, hashes and provenance. It is a **source provenance document,
  not a newly written execution receipt**. It does not invent a new deployment,
  a live verification timestamp, Git commit SHA, S3 version, or consent result.
- All 14 runtime source files contained in the retained reviewed PATCHED API
  package match Git working source byte-for-byte. The old package was prepared
  with unpublished source on top of df57410; this commit finally publishes it.
  The new commit does not retroactively change that artifact's release identity.
  For the four unchanged Lambdas, the three differing BASE modules are also
  versioned under `deployments/base-runtime-source/`; the other eleven source
  files are shared. Both complete source sets are hash-mapped in the manifest.
  These BASE references must never overwrite the PATCHED API.
- The disabled-default source template plus the reviewed
  [private IAM/API-code overlay](../services/newsletter/deployments/private-confirmation-overlay.json)
  describes the existing deployment. The base template alone must not overwrite
  the live patch. The overlay is a reference, not a deployment request.
- Git contains source, lockfiles, structural fixtures and tests. Exact historical
  ZIP bytes remain bound to retained immutable artifacts and recorded SHA256s;
  fresh dependency installation/recompression is not claimed to reproduce their
  compression bytes. No ZIP, delta package or execution payload was created here.

## Audit outcome and necessary preparation

All 26 previously unpublished files were individually classified and retained in
this reviewed source set. No application runtime source was changed during the
synchronization audit; the existing completed changes are the ones being published.

The five dated runbooks now prominently mark old deploy/recovery/activation
commands historical and superseded. Current operations live in versioned
`services/newsletter/ops/` and this review, rather than ignored chat handoffs.
The completed diagnostic source is retained for audit with offline tests, not run
again. Finalization and strict preview source/tests are promoted from local
verification work without promoting its data or logs.

Three operational sources formerly embedded the private test mailbox. Git source
now requires explicit private `NEWSLETTER_TEST_MAILBOX` configuration, with missing
configuration failing before cloud access/output. Immutable deployed copies are
untouched. The BASE-only activation CLI now stops before any cloud operation;
its old functions remain for historical regression tests. It cannot be used as
an activation continuation for the PATCHED API.

Tests previously read ignored release ZIPs and diagnostic files. They now use
safe versioned structural/historical fixtures and a synthetic in-memory staging
payload. The original manifest, isolation, path, immutable checkpoint, runtime,
IAM, foreign integration and uncertainty checks remain exercised. Fixture sources
are never procedures to execute against AWS. Operational Python tests are included
in the normal newsletter test command. `.gitattributes` preserves reviewed runtime
LF bytes and exact reference bytes across platforms.

## Vercel and website impact

Before this proposal, `vercel.json` explicitly enabled master automatic deployment.
A plain push therefore carried production deployment risk; it must not be described
as an AWS-only action. The Vercel project list was readable, but project details
returned 403. No connection, environment, production deployment or provider setting
was changed. Unreadable dashboard settings are not treated as verified.

The user expressly approved including **`git.deploymentEnabled.master=false`**.
This proposal uses that documented repository control to hold automatic master
builds while synchronizing Git. See [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration).
Do not rely on an unverified commit-message skip token. Existing `crons: []`
remains. No workflow or build hook deploys AWS in this repository.

The existing content test asserted master=true; it is updated to enforce the
newly approved hold. Website production application files are unchanged:
`NEWSLETTER_SIGNUPS_PAUSED=true`, signup stays unavailable, and legacy delivery/
feedback routes remain retired. Newsletter runtime code is outside `src/app` and
`public`, and is not imported by the website. It is not exposed as a new website
API by committing it. A later website deployment or Cloudflare migration needs
its own review; newsletter delivery remains on independent AWS resources.

## Validation

- Newsletter application/operational suite: **410 Node tests PASS**; includes
  execution of **28 Python operational tests PASS**, no failures/skips.
- Newsletter syntax/infrastructure safety check: PASS; disabled defaults and
  retained Ledger preserved, no AWS connection.
- Website safety/auth/public tests: 105 PASS; content recheck: 28 PASS. Total
  **133 website tests PASS** after aligning the existing Vercel policy assertion.
  No production website code changed to address the policy mismatch.
- Clean-source export: private release and verification directories are absent;
  tests use versioned fixtures. The website and newsletter installed dependencies
  are linked separately. This checks source completeness, not a fresh network
  dependency install. **410 tests PASS** with no failures/skips. The final clean-source rerun also passed all **410 tests**, including the
  BASE source snapshot checks and the 28 Python operational tests.
- Reviewed package/source comparison: 14/14 matching source hashes; no archive
  written. 21 Python procedures and the three BASE JavaScript references compile without
  execution. The 62-file allowlist/secret/path audit and 13 explicit exclusion
  probes PASS; all 91 preserved local artifacts remain byte-identical.
  `git diff --check` PASS; nothing is staged, committed or pushed.
- A website production build/deployment is not part of this synchronization. No
  application/Next runtime code changed; no Cloudflare portability claim substitutes
  for the later adapter/migration review.

## Reproduce the source checks from a fresh checkout

Use Node.js >=22 and Python 3 on PATH. Install the website and independent
newsletter dependency graphs from their respective committed lockfiles:

```powershell
npm ci
npm --prefix services/newsletter ci
npm --prefix services/newsletter test
npm --prefix services/newsletter run check
npm test -- safety auth public content
```

No AWS credential, subscriber dump, old ZIP or private checkpoint is needed for
these tests. The reviewed clean-source run used existing installed dependencies
via separate links; a fresh network install was not performed during this audit.
Do not run package/deployment/activation commands as part of reproducing tests.

## Exact proposed commit contents

The table below is the complete delta, not a directory-wide staging instruction.
The [machine-readable inventory](newsletter-git-sync-files-2026-10-28.json) records
all paths, their normalized source SHA256s and the original 26-file classification.
Its own bytes are bound by the review audit's inventorySha256 and ultimately the
containing Git commit, avoiding a self-referential hash.

| Path | Change | Purpose |
| --- | --- | --- |
| `.gitignore` | modify | Exclude private operational state and preserve canonical source bytes |
| `services/newsletter/README.md` | modify | Current or explicitly historical operational documentation and synchronization inventory |
| `services/newsletter/scripts/cloudshell-signup-release.py` | modify | Reviewed historical deployment/recovery tooling; no current deployment authority |
| `services/newsletter/scripts/package-signup-release.py` | modify | Reviewed historical deployment/recovery tooling; no current deployment authority |
| `services/newsletter/src/aws.mjs` | modify | Completed PATCHED runtime application change; reviewed archive bytes match |
| `services/newsletter/src/handlers.mjs` | modify | Completed PATCHED runtime application change; reviewed archive bytes match |
| `services/newsletter/src/http.mjs` | modify | Completed PATCHED runtime application change; reviewed archive bytes match |
| `services/newsletter/src/service.mjs` | modify | Completed PATCHED runtime application change; reviewed archive bytes match |
| `services/newsletter/template.json` | modify | Current or explicitly historical operational documentation and synchronization inventory |
| `services/newsletter/test/confirmation.test.mjs` | modify | Offline application or operational regression coverage |
| `services/newsletter/test/public-http.test.mjs` | modify | Offline application or operational regression coverage |
| `services/newsletter/test/release-preparation.test.mjs` | modify | Offline application or operational regression coverage |
| `src/lib/sanity/tests/newsletter-aws.test.ts` | modify | Existing website test aligned with the approved master deployment hold |
| `vercel.json` | modify | Approved master auto-deployment hold; existing website remains pinned |
| `.gitattributes` | add | Exclude private operational state and preserve canonical source bytes |
| `docs/newsletter-confirmation-post-fix-2026-10-27.md` | add | Current or explicitly historical operational documentation and synchronization inventory |
| `docs/newsletter-confirmation-post-fix-results-2026-10-27.md` | add | Current or explicitly historical operational documentation and synchronization inventory |
| `docs/newsletter-confirmation-runtime-assembly-fix-2026-10-27.md` | add | Current or explicitly historical operational documentation and synchronization inventory |
| `docs/newsletter-git-sync-2026-10-28.md` | add | Current or explicitly historical operational documentation and synchronization inventory |
| `docs/newsletter-git-sync-files-2026-10-28.json` | add | Current or explicitly historical operational documentation and synchronization inventory |
| `docs/newsletter-private-signup-repair-2026-10-27.md` | add | Current or explicitly historical operational documentation and synchronization inventory |
| `docs/newsletter-recovery-completion-2026-10-27.md` | add | Current or explicitly historical operational documentation and synchronization inventory |
| `services/newsletter/deployments/base-runtime-source/README.md` | add | BASE source reference for the four unchanged Lambdas; never a deployment payload |
| `services/newsletter/deployments/base-runtime-source/src/aws.mjs` | add | BASE source reference for the four unchanged Lambdas; never a deployment payload |
| `services/newsletter/deployments/base-runtime-source/src/http.mjs` | add | BASE source reference for the four unchanged Lambdas; never a deployment payload |
| `services/newsletter/deployments/base-runtime-source/src/service.mjs` | add | BASE source reference for the four unchanged Lambdas; never a deployment payload |
| `services/newsletter/deployments/deployment-reviewed-2026-10-28.json` | add | Sanitized source/deployment provenance or reference-only infrastructure overlay |
| `services/newsletter/deployments/private-confirmation-overlay.json` | add | Sanitized source/deployment provenance or reference-only infrastructure overlay |
| `services/newsletter/ops/README.md` | add | Canonical post-execution operational source/documentation; no execution approval |
| `services/newsletter/ops/finalize_deployment.py` | add | Canonical post-execution operational source/documentation; no execution approval |
| `services/newsletter/ops/preview_deployment.py` | add | Canonical post-execution operational source/documentation; no execution approval |
| `services/newsletter/ops/reconcile_read_only.py` | add | Canonical post-execution operational source/documentation; no execution approval |
| `services/newsletter/scripts/audit-git-release.py` | add | Reviewed historical deployment/recovery tooling; no current deployment authority |
| `services/newsletter/scripts/cloudshell-confirmation-fix.py` | add | Reviewed historical deployment/recovery tooling; no current deployment authority |
| `services/newsletter/scripts/inspect-confirmation-template.py` | add | Reviewed historical deployment/recovery tooling; no current deployment authority |
| `services/newsletter/scripts/package-confirmation-fix.py` | add | Reviewed historical deployment/recovery tooling; no current deployment authority |
| `services/newsletter/scripts/recover-private-signup.py` | add | Reviewed historical deployment/recovery tooling; no current deployment authority |
| `services/newsletter/scripts/run-private-signup-repair.py` | add | Reviewed historical deployment/recovery tooling; no current deployment authority |
| `services/newsletter/scripts/run-verified-activation.py` | add | Reviewed historical deployment/recovery tooling; no current deployment authority |
| `services/newsletter/scripts/seal-signup-release.py` | add | Reviewed historical deployment/recovery tooling; no current deployment authority |
| `services/newsletter/test/confirmation-changeset.test.mjs` | add | Offline application or operational regression coverage |
| `services/newsletter/test/confirmation-deployment.test.mjs` | add | Offline application or operational regression coverage |
| `services/newsletter/test/confirmation-runtime-assembly.test.mjs` | add | Offline application or operational regression coverage |
| `services/newsletter/test/confirmation-template-inspection.test.mjs` | add | Offline application or operational regression coverage |
| `services/newsletter/test/fixtures/confirmation/README.md` | add | Safe structural/historical regression fixture; no private state |
| `services/newsletter/test/fixtures/confirmation/before-processed.json` | add | Safe structural/historical regression fixture; no private state |
| `services/newsletter/test/fixtures/confirmation/expected-processed.json` | add | Safe structural/historical regression fixture; no private state |
| `services/newsletter/test/fixtures/confirmation/initialize-forward-audience.py` | add | Safe structural/historical regression fixture; no private state |
| `services/newsletter/test/fixtures/confirmation/legacy-confirmation-launcher.py` | add | Safe structural/historical regression fixture; no private state |
| `services/newsletter/test/fixtures/confirmation/legacy-release-helper.py` | add | Safe structural/historical regression fixture; no private state |
| `services/newsletter/test/fixtures/confirmation/legacy-template-diff.py` | add | Safe structural/historical regression fixture; no private state |
| `services/newsletter/test/fixtures/confirmation/original-manifest.txt` | add | Safe structural/historical regression fixture; no private state |
| `services/newsletter/test/fixtures/confirmation/original-release-metadata.json` | add | Safe structural/historical regression fixture; no private state |
| `services/newsletter/test/fixtures/confirmation/original-template.json` | add | Safe structural/historical regression fixture; no private state |
| `services/newsletter/test/fixtures/confirmation/template-diagnostic.py` | add | Safe structural/historical regression fixture; no private state |
| `services/newsletter/test/fixtures/confirmation/working-manifest.txt` | add | Safe structural/historical regression fixture; no private state |
| `services/newsletter/test/operations.test.mjs` | add | Offline application or operational regression coverage |
| `services/newsletter/test/private-signup-repair.test.mjs` | add | Offline application or operational regression coverage |
| `services/newsletter/test/release-synchronization.test.mjs` | add | Offline application or operational regression coverage |
| `services/newsletter/test/test_finalization.py` | add | Offline application or operational regression coverage |
| `services/newsletter/test/test_preview.py` | add | Offline application or operational regression coverage |
| `services/newsletter/test/test_reconciliation.py` | add | Offline application or operational regression coverage |

## Must remain excluded and locally preserved

- `/releases/`, `/release/`, all ZIPs/archives, runtime deltas and executable
  release delivery payloads. Do not recreate, re-seal, upload or delete them.
- `.verification/`, including original handoffs, completed/live diagnostic output,
  logs, local audit hashes and disposable clean-source test exports. Safe source
  was copied into canonical paths; private evidence is not force-added.
- Original/prior/working hidden checkpoints, `.cloudshell-release-state.json*`,
  `.confirmation-fix-state*`, and every `*-RECEIPT.json`, including immutable
  DEPLOYMENT/PRIVATE-REPAIR receipts. No receipt finalization is being performed.
- Subscriber/baseline/claim/suppression datasets, private consent/audience receipts,
  mailbox/token evidence, signing keys, `.env*`, `.aws/`, credentials, private SAM
  parameters, `.newsletter-private/`, `.newsletter-backup-private/` and backups.
- Installed dependencies, SAM output, caches, Python bytecode and website build
  output. Retention and exclusion are not deletion instructions.

The versioned fixture manifests contain filenames/hashes only; their sanitized
reference templates and metadata contain no subscriber/key/checkpoint/receipt data.
They are explicitly identified as structural test inputs, not live execution
records. Runtime source/package hashes are public integrity identifiers, not tokens.

## One synchronization after explicit approval

Recommended commit title:

`chore(newsletter): synchronize verified AWS source and hold Vercel master`

1. Review this complete diff and inventory; approve this one commit/push, including
   the master deployment hold and explicit exclusions. No new AWS approval is implied.
2. Run `python -B services/newsletter/scripts/audit-git-release.py`. It rejects
   source/hash/path drift, private credentials/mailboxes/capabilities, unexpected
   working/staged paths, runtime-source changes or loss of the website/master hold.
   Recheck that remote master still matches the reviewed base. If it changed, stop
   for review; do not reset, force-push or silently merge unreviewed changes.
3. Stage **only** the `include[].path` values in the reviewed JSON inventory;
   never `git add .`, `git add -A`, force-add ignored data or stage release folders.
   Compare `git diff --cached --name-only` with that exact set and run
   `git diff --cached --check`; review the staged source and exclusions once more.
4. Create the one approved commit with the title above. Confirm its parent is the
   reviewed base and its tree contains exactly the approved changes. Push once with
   `git push origin HEAD:master`; no force, new AWS deployment, activation or ZIP.
5. Read back remote master and confirm it matches the approved commit. Confirm
   Vercel master deployment is held and the website remains on the last approved
   deployment; unexpected provider activity is a stop for review, not permission
   to promote or modify it. Git and AWS deliberately have distinct release IDs. Do not deploy AWS to
   make the four BASE Lambdas match the newer shared source; both versions are
   intentionally represented in Git and the verified live split remains unchanged.

No staging, commit, tag or push was performed during this review. Failure recovery
preserves the working tree, private state and immutable artifacts; it never rewrites
history or repairs AWS. Any changed proposal requires a new reviewed inventory/hash.

## Separate controlled consent test after synchronization

Git synchronization does not prove a browser confirmation, unsubscribe, provider
feedback or readiness result. The working checkpoint remains executionStarted=true
with deployed absent/non-Boolean; the deployment receipt remains unfinished.
Bookkeeping, if pursued, requires its own exact-evidence/plan approval and no AWS
replay. Missing historical identity bindings are not fabricated to pass preview.

Prepare and test a version-aware continuation separately; keep old activation
unused. Explicitly approve a new isolated test identity eligible under existing
recipient IAM, one fresh confirmation email, and a bounded private registration/
confirmation gate window. If existing exact-recipient policy cannot accommodate
that identity, stop for isolation/IAM review rather than reusing old subscriber
state, weakening restrictions or clearing suppression. The bounded window can
also admit other still-valid links; review isolation before approving it.

Use a fresh nonce/token only, never the exposed old token or existing pending
claim. Keep registration routes IAM-protected, delivery false, both schedules
disabled and all runtime versions unchanged. Test the real browser GET/POST and
single consent consumption, close enrollment/confirmation, then verify the new
identity's unsubscribe and replay safety through the existing HTTP flow. Generate
its unsubscribe capability only through a separately reviewed secure signing path,
without exposing key/token material or sending a digest. Leave that new identity
suppressed; retain every earlier record, claim, key, suppression and checkpoint.
No public signup, weekly activation, campaign send or synthetic provider-feedback
injection is included. Record only the newly proven results in a separately
approved test receipt.
