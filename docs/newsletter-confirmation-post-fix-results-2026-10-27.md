> Historical preparation record. The AWS confirmation patch was successfully executed and reconciled on 28 October 2026. See [the current Git synchronization review](newsletter-git-sync-2026-10-28.md) and [sanitized provenance](../services/newsletter/deployments/deployment-reviewed-2026-10-28.json). Do not run the deployment, recovery, ZIP, old-token or activation commands below. Receipt finalization and fresh-token consent testing remain separately unapproved.

# POST /confirm repair validation

The deployed confirmation GET used `Referrer-Policy: no-referrer`. A real isolated
headless Edge browser submitted its native form as `Origin: null`; the deployed
HTTP wrapper returned **403 / origin_denied**, leaving synthetic consent PENDING.
The corrected GET uses `strict-origin`: Edge sent the HTTPS Origin, Referer contained
only the origin, and the same native POST returned **200**, recording CONFIRMED.
Both captured browser bodies were form-urlencoded `action=confirm`, base64 encoded
in the API Gateway v2 event. No email or AWS request was made by this reproduction.

This proves the deployed browser defect matching the reported symptoms. The live
failed POST's HTTP status was not supplied; new status/phase/category diagnostics
can identify a separate gate/provider/transaction blocker if one remains.

Changes are limited to confirmation document policy, safe confirmation HTTP/log
diagnostics and their tests. The consent transaction conditions, Origin rejection,
token extraction, signature, purpose, expiry, nonce and suppression checks remain
enforced. The package changes three API runtime modules and no other runtime files.

Validation completed:

- **370 newsletter tests passed**, zero failures or skipped tests.
- Focused native form tests run plain/base64 bodies through the actual DynamoDB
  confirmation adapter with modeled atomic conditions and delivery disabled.
- Seven deployment tests cover exactly one non-replacing API modification, unchanged
  template parameters/resources, revoked approval rejection, accepted claim/nonce
  binding, original checkpoint reuse, no signup/resend, already-confirmed resume,
  approval refusal and wrong original manifest.
- Targeted ESLint passed. JavaScript syntax/infrastructure invariants passed.
- All newsletter Python procedures compile without cloud execution.
- Exact base runtime/manifest, reconstruction hash, all unchanged runtime files,
  current replacement source, deployment procedure and ZIP integrity verified.
- `git diff --check` passed.

Final artifact:

- `releases/newsletter-confirmation-post-fix-20261027/chronoverse-confirmation-fix.zip`
- Size: **27,390 bytes**.
- ZIP SHA-256: `895ca7564c6fbf96c7ce86ffa1232857ab94bc8721eee19355ddcad0fe91b2b7`
- Patch ID: `confirmation-post-fix-d5baf38d3124`
- Corrected API runtime SHA-256: `638f813fa3682caf7ccdbac556e557b65928c036836ce5221337b65bdacca150`
- Base runtime SHA-256: `89636d5a22d004e9274a0a6190a46de1904a2c7516cfa70624f62845a3f258c8`
- Exact CloudShell command: sibling `EXECUTE.txt`.

Follow [the packaged operator procedure](newsletter-confirmation-post-fix-2026-10-27.md).
Keep the existing extracted private release and hidden checkpoint. The patch
requires explicit change-set approval, preserves the accepted confirmation claim,
and prompts for reloading the ORIGINAL inbox link before the deliberate POST.
It continues the original unsubscribe/feedback tests and closes enrollment again.
Other Lambda runtimes and weekly automation are unchanged. No local deployment,
subscriber write, email send, commit or push was performed.
