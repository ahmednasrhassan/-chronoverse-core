# Newsletter operations after the successful confirmation deployment

The current state and source/artifact relationship are recorded in
[`deployment-reviewed-2026-10-28.json`](../deployments/deployment-reviewed-2026-10-28.json)
and the [synchronization review](../../../docs/newsletter-git-sync-2026-10-28.md).

The AWS update succeeded. **Do not run a deployment launcher, PREPARE, EXECUTE,
create another change set, rebuild/upload a package, or run the old activation.**

- `reconcile_read_only.py` preserves the completed diagnostic's reviewed source.
  Its reads are already complete. Retain it and its offline tests for audit;
  do not repeat it as a prerequisite to Git synchronization.
- `finalize_deployment.py` is the exact previously reviewed standalone finalizer
  (SHA256 `608485c15ccec1997f03179160c32a685064be4aa628596614e8b03e49edc125`).
  It contains a separate approval-controlled writer. **No receipt/checkpoint
  write has been approved or performed.** Do not invoke its write option.
- `preview_deployment.py` is the canonical read-only preview entry point. It
  verifies that finalizer checksum, blocks writes, temporary files, subprocesses
  and network calls during preview, validates retained evidence and rechecks
  input hashes. It prints only a proposed receipt, sanitized identities and
  hashes. It never calls the writer or a launcher.

The saved diagnostic's ID-match Booleans do not independently bind current
checkpoint bytes. The strict preview stops unless existing retained evidence
also contains `Metadata.WorkingCheckpoint.Sha256` or the actual matching
`RecordedChangeSet.ChangeSetId` and `Stack.ChangeSetId`. Contradictory fields or
any failed evidence section also stop it. Never invent these fields, silently
weaken the preview or restart diagnostics to force a passing preview.

After separately approved delivery, preview uses only the already saved file:

```bash
python3 -I -S -B /path/to/ops/preview_deployment.py --saved-evidence /absolute/path/to/existing-reconciliation.json
```

STOP after the preview. A future receipt write requires explicit approval of
the exact finalization plan hash and its association with retained live evidence.
Every original and working checkpoint must remain byte-identical. Conflicting
or partial receipts are preserved for manual review, never overwritten or reset.
Any failure, including FileNotFoundError, stops the workflow; no deployment retry
or automatic containment write is authorized. Historical caller/route snapshot
uncertainty is not converted into a fabricated assertion or consent result.

Run all tests offline with `npm --prefix services/newsletter test`; the operational
unittests use disposable synthetic fixtures and no actual AWS evidence/state.

Git operational sources now require `NEWSLETTER_TEST_MAILBOX` as explicit private
configuration; no real recipient is stored in source. Do not put its value in
Git, logs or examples. Immutable deployed releases retain their original bytes
and behavior. The BASE-only `run-verified-activation.py` CLI is disabled before
any cloud operation; its old functions remain only for regression coverage.

After Git synchronization, separately review a version-aware fresh-token consent
test. One new eligible operator-controlled identity, a bounded private gate
window and one new confirmation email need explicit approval. Existing SES
recipient IAM restrictions may block a new identity; review that constraint
before testing rather than weakening IAM or reusing the pending record/token.
Keep delivery false and both schedules disabled. Test real browser GET/POST,
single consent consumption and unsubscribe/replay while closed; leave the new
identity suppressed and every earlier subscriber/claim/key/checkpoint intact.
Do not use the exposed old token, old activation, or a digest to obtain a link.
