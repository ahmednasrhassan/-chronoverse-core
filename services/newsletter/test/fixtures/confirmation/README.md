# Offline confirmation references

These source fixtures make regression tests independent of ignored `releases/`
and `.verification/` directories. They contain no checkpoint, subscriber row,
capability, claim, signing key, credential or deployment receipt.

- Original/before/expected templates are non-secret CloudFormation definitions
  and reviewed structural references. Their physical IDs are infrastructure
  identifiers, not authentication material. They authorize no deployment.
- Original/working manifests contain only artifact filenames and SHA256 values;
  release metadata contains sanitized deployment provenance, not private state.
- `legacy-release-helper.py` is the earlier helper with its private test mailbox
  replaced by `operator@example.test`. Its original checks remain in place.
  The adjacent audience initializer is required by its import. This sanitized
  helper is a regression fixture, not the checksum-pinned CloudShell original.
- Other legacy Python files preserve historical comparison behavior needed to
  detect regressions. **Never execute these fixtures against AWS.** Diagnostic
  tests supply synthetic clients; no completed diagnostic is being repeated.
- The launcher staging test generates a seven-file synthetic payload in memory.
  It substitutes fixture checksum pins while retaining all path, identity,
  checkpoint, manifest and collision checks. It creates no release package.

Exact reference bytes are preserved by `.gitattributes`. Actual immutable
releases, manifests, receipts and private checkpoints stay in their original
local/CloudShell locations and remain excluded from Git.
