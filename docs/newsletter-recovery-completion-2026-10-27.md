> Historical preparation record. The AWS confirmation patch was successfully executed and reconciled on 28 October 2026. See [the current Git synchronization review](newsletter-git-sync-2026-10-28.md) and [sanitized provenance](../services/newsletter/deployments/deployment-reviewed-2026-10-28.json). Do not run the deployment, recovery, ZIP, old-token or activation commands below. Receipt finalization and fresh-token consent testing remain separately unapproved.

# Newsletter recovery completion — 27 October 2026

Local implementation and release preparation are complete. Live verification and
activation remain operator tasks because the request explicitly prohibits AWS
changes and real email sends from the local development session. All existing
uncommitted changes were preserved. No commit, push, AWS mutation or real email
send was performed.

## Root cause and its evidentiary limit

The pinned failed release runtime
`a4414c220392ab4e6a4121cb57b3cacfb90261cb49bfab67318cbda9867094dc`
unconditionally rejected an API Gateway event whose POST body was base64 encoded.
An offline reproduction using its actual archived HTTP/domain modules produced
GET **200**, POST **400**, without reaching the internal subscription handler.
Identical synthetic requests through the corrected wrapper produced GET **200**,
POST **202**. No email was sent. This proves a defect in the failed runtime;
the original live POST's status/encoding were not saved, so attribution of that
individual request remains unproven. IAM permissions, SigV4, CONTROL or a dependency
failure cannot be ruled out for that historical invocation from the available evidence.

The release signs the same URL, Origin, content type and form bytes it transmits.
New bounded diagnostics distinguish decoding, parsing, Origin/trusted context,
consent, CONTROL, subscriber/rate/provider reads, pending/claim writes, SES send and
acceptance acknowledgement. The actual HTTP status and allowlisted result category
are preserved without reading/logging response bodies. API Gateway access logs use
the existing custom API log group and contain request/status/integration fields only.

## Completed changes

- Strictly decode canonical base64 into at most 4096 UTF-8 bytes and clear the
  encoding flag only for normalized internal JSON. Retain all consent/Origin/context gates.
- Propagate safe dependency failure categories to the HTTP probe. Uncertain send
  acknowledgement is explicitly classified; original claims remain held.
- Import the original failed checkpoint without clearing signup intent; verify its
  exact runtime/target/baseline. Require complete durable Ledger/SES evidence reads,
  drained private invocations, explicit operator approval, and a permanent one-use
  recovery authorization consumed atomically before any new POST. Any attributable
  side effect blocks a fresh attempt. No automatic resend is introduced.
- Preserve double opt-in confirmation, fresh consent eligibility, permanent
  suppression, provider opt-outs and immutable article/recipient claims.
- Check nonmutating management GET, deliberate confirmation, browser unsubscribe,
  repeat unsubscribe, invalid nonce and originless email-client one-click POST.
- Verify both synthetic complaint and permanent bounce through managed SNS/SQS,
  their durable suppression audits, original opt-out preservation, SES contact opt-out
  and the actual confirmation Delivery event. Synthetic feedback is labelled as such.
- Include a separate approval-gated public/weekly continuation in the same ZIP.
  It rechecks live proof, generates the website marker and requires the deployed
  direct AWS Subscribe link before enabling future schedules. It performs no Git
  operations. The website patch is prepared while the repository pause stays enabled.
- Add an offline immutable ZIP sealer with manifest, source, lockfile, Python syntax,
  disabled-default and retained-Ledger checks. Release identity includes templates,
  runbook and website switch inputs as well as runtime/procedures.

## Validation

| Check | Result |
| --- | --- |
| `npm --prefix services/newsletter test` | 355 passed, zero failed/skipped |
| `npm test -- safety auth public content` | 133 passed, zero failed/skipped |
| `npm run lint` | Passed; one preexisting `no-img-element` warning in `src/app/(site)/[slug]/page.tsx:413` |
| `npm run typecheck` | Passed |
| `npm run build -- --webpack` | Passed; 117/117 static pages generated |
| `npm --prefix services/newsletter run check` | Passed |
| Python procedures | All nine compile without executing cloud code |
| Website activation patch | `git apply --check` passed; patch not applied |
| Release validation | Passed; corrupted runtime, rehashed procedure drift and ZIP overwrite rejected |
| `git diff --check` | Passed |

Tests use synthetic fixtures and blocked Node networking. Release packaging reuses
only the checksum-verified dependency files from the pinned original runtime and
its byte-identical dependency lock. Runtime source and templates are read freshly.

## Deliverable and live continuation

- ZIP: `releases/newsletter-recovery-20261027/chronoverse-newsletter-recovery.zip`
- ZIP SHA-256: `4ce1f08a3561dc54fd61254880731793f94a14e307d6b17629dc3e2251e15bd9`
- Release: `private-signup-repair-20261027-739404fe3d61`
- Runtime SHA-256: `89636d5a22d004e9274a0a6190a46de1904a2c7516cfa70624f62845a3f258c8`
- Exact CloudShell command: `releases/newsletter-recovery-20261027/EXECUTE.txt`
- Machine-readable local release validation: `releases/newsletter-recovery-20261027/validation.json`

Upload the ZIP to CloudShell, run the checksum-bound command, supply the ORIGINAL
failed extracted release directory with its hidden checkpoint, review the change sets,
and approve a single recovery only if every no-side-effect proof passes. Observe
the actual confirmation email and deliberately confirm it; let the launcher verify
unsubscribe and managed feedback. Public enrollment and weekly delivery stay closed
throughout private verification.

Then follow the three continuation steps in
[the packaged runbook source](newsletter-private-signup-repair-2026-10-27.md):
separately approve public opening; obtain explicit approval for the website
patch/marker commit and deployment; verify that deployment and separately approve
the two weekly change sets. Do not delete records or reset checkpoints if recovery
blocks. Complete an existing accepted enrollment instead of issuing a new one.
