> Historical preparation record. The AWS confirmation patch was successfully executed and reconciled on 28 October 2026. See [the current Git synchronization review](newsletter-git-sync-2026-10-28.md) and [sanitized provenance](../services/newsletter/deployments/deployment-reviewed-2026-10-28.json). Do not run the deployment, recovery, ZIP, old-token or activation commands below. Receipt finalization and fresh-token consent testing remain separately unapproved.

# Focused POST /confirm repair

## Confirmed canonical JSON comparison fix

The final operator-run AWS comparison for
`confirmation-post-fix-ac0340cdb5f7-d815697a` returned
`NativeComparisonEqual: false`, `SemanticDifferences: []`, and `SameJson: true`
for all four IAM security probes. The current stack lacks those security entries;
both the reviewed expected patch and pending template contain them identically.
There is no semantic template discrepancy to whitelist.

Botocore's CloudFormation GetTemplate handler parses objects as `OrderedDict`.
The old equality check compared two OrderedDict trees and therefore treated object
key insertion order as content. The earlier diagnostic also stopped at plain-dict
versus OrderedDict type differences: `ApiFunction.Properties.Code`, API components,
and each of the three IAM requirement objects. Its shape table raised KeyError for
OrderedDict. All five diagnostic paths and the deployment STOP were reproduced
against the complete 50-resource templates using native botocore-style decoding.

The launcher now compares canonical JSON with recursively sorted OBJECT keys,
unchanged arrays, unchanged values/types/intrinsic expressions, and NaN forbidden.
Every resource/property remains part of the comparison. No property is ignored,
removed, defaulted or broadly permitted. Source-template and before/after security
snapshot comparisons use the same order-independent content comparison. Original
file/manifest checksums, exact runtime hash, change-set scope/property/source checks,
IAM routes, exact recipient restrictions, suppression checks and checkpoints remain
mandatory. The application runtime and SAM template construction are unchanged.

## Exposed token: deployment only

The existing confirmation token appeared in chat. This package does NOT reopen
registration/confirmation or ask anyone to click the old email. It does not resend,
reset/recreate enrollment, rotate keys/nonces, replace claims, advance the original
confirmation/test checkpoint, unsubscribe anyone or attest fresh consent. It ends
with CONTROL enrollment/confirmation CLOSED and weekly delivery OFF, and writes a
separate `DEPLOYMENT-RECEIPT.json` stating deployment VERIFIED / freshConsent REQUIRED.
The original pending row, accepted claim, signing keys, suppression state and
private-release checkpoint remain intact. This supersedes all older continuations
that asked the operator to reload the original confirmation email.

## Final change-set inspection correction

The `1476bf7803cf` package used the same strict two-resource check on a hard-coded
HISTORICAL set before calling `create_change_set` for its NEW patch. Thus the
reported scope error can occur before any new-prefix set exists. There is no
`delete_change_set` or change-set cleanup call in that procedure; its error path
only closes enrollment gates. A local reproduction against that immutable prior
script demonstrates this pre-creation failure path. The historical live summary
does not establish the current historical response or any newer response. Without
the missing resource diagnostics, the exact latest AWS resource list cannot be
recovered from the generic error; no new resource changes are assumed safe.

The procedure now reads ALL `list_change_sets` pages, retains historical sets as
read-only evidence, and never applies deployment approval checks to them. Missing,
obsolete, differently shaped or concurrently unavailable historical sets cannot
authorize execution or prevent preparation of a separately validated new set.
No historical set is deleted or executed, and all old directories/checkpoints
remain intact. Its ID inventory is saved separately in the new patch checkpoint.

For the NEW set, its intended name is saved before creation and its returned ID
is saved/printed before waiting. ALL `describe_change_set` pages are read with
`IncludePropertyValues=True`, checked for consistent stack/change-set identity
and status, then aggregated before resource/property validation. Repeated tokens,
identity/status changes, duplicate/unexpected resources or incomplete collections
stop execution. A resource on a later page receives exactly the same scrutiny as
one on the first page. The complete Original/Processed template comparisons and
private route/integration checks remain mandatory before approval AND execution.

Each received describe page is printed and flushed BEFORE any validation failure
or gate closure, using an explicit allowlist: change-set/resource IDs, resource
actions/replacement flags, Target Attribute/Name/RequiresRecreation, Evaluation,
ChangeSource and identifier-only CausingEntity. No property values, contexts,
parameter values, paths, descriptions, status reasons, SDK messages, subscriber
data, tokens or pagination tokens are printed. Creation-wait failures also read
the safe summary before stopping. No failure deletes a set or replays execution.

This correction changes deployment inspection only. The three application modules,
byte-copy delta, full runtime SHA256 and security-preserving template edit are
identical to the previously reviewed patch. No newsletter rebuild, enrollment
reset, claim replacement, mail send or live AWS mutation is performed locally.

## Change Set validation correction

The operator supplied the exact live `HttpApi` detail for the blocked set
`confirmation-post-fix-fd0a94a147dc-47128883`: `Properties.Body`, recreation
`Never`, evaluation `Dynamic`, source `ResourceAttribute`, causing entity
`ApiFunction.Arn`. SAM embeds that ARN in each generated OpenAPI Lambda proxy
integration. CloudFormation therefore reports a dependent `HttpApi` modification
when API Lambda code changes, even though neither resource is replaced. The old
`len(changes) == 1` assertion was incorrect.

The pinned original template does not declare the three live registration route
IAM restrictions. A Body reimport must not rely on those manual settings surviving.
The new template explicitly declares the SAME restrictions: `EnableIamAuthorizer`
and event-level `AWS_IAM` for GET/POST `/register` and POST `/subscribe`. No default
authorizer is introduced. The eight confirmation/unsubscribe operations remain
browser-accessible and retain their existing application capability checks.

The new validator requires exactly `ApiFunction` and `HttpApi`, both `Modify`,
`Replacement=False`, matching existing physical IDs and resource types, scope
`Properties` only. Lambda details must target `Code`, recreation `Never`, direct
static modification. API details must target `Body`, recreation `Never`, with
the supplied dynamic `ApiFunction.Arn` dependency and/or a direct static edit.
Those detail checks are necessary but insufficient: the ENTIRE pending processed
template must equal the current processed template except the exact immutable
S3 code location and the three private IAM operation requirements/security scheme.
Every integration remains AWS proxy, POST, payload 2.0, the same unqualified
`ApiFunction.Arn`. All eleven paths/methods are pinned. Added routes, CORS,
authorizers, permissions, environment, parameters, database, signing secret,
stage/throttling or schedule changes stop execution.

The CloudShell procedure inventories historical sets read-only and retains them.
It does not delete them or alter their checkpoint/directories. It prepares a NEW security-pinned
set, validates twice around operator approval, and executes only that newly
created ID. CloudFormation may obsolete older sets after the new update. No old
set is replayed. Live route authorization/integration settings are compared before
and after the update. This package never reopens the confirmation gate. Change contexts,
parameter values and private subscriber data are never printed.

Local validation used AWS SAM translator 1.115.0 with networking blocked and the
exact pinned original template: precisely these two resources change, with no
additions/removals. The operator-supplied property detail establishes the live
dependency cause. Full live processed-template and route inspection remains a
mandatory CloudShell pre-execution check; the local AWS connector could not
inspect them because it required reauthentication.

References: [CloudFormation change detail semantics](https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_ResourceChangeDetail.html),
[SAM route-level IAM authorization](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-property-function-httpapifunctionauth.html).

## Deployment packaging correction

The earlier patch stopped before artifact upload or CloudFormation preparation
with `Reconstructed runtime differs from reviewed patch`. Its reconstruction
recompressed all 4,131 entries with `ZIP_DEFLATED`, then compared the archive hash.
The package was reviewed under Windows Python 3.14 using zlib-ng. Other zlib
implementations can produce different DEFLATE bytes for identical input files.
Reproducing with standard zlib changed 3,032 compressed entry sizes and the runtime
SHA-256, while all 4,131 uncompressed files stayed identical. The integrity check
correctly stopped; the assumption that recompression preserved reviewed bytes was wrong.

The corrected package includes `runtime.delta` and a bounded byte-copy plan. It
copies unchanged ZIP records from the checksum-pinned original and inserts the
exact reviewed replacement records/directory from the checksum-pinned delta.
CloudShell never compresses or writes ZIP records. The original full-runtime
SHA-256 comparison remains mandatory, followed by verification of every file:
only the three already-tested confirmation modules may differ. All original
before/after module checks and the full base/manifest checks remain mandatory.

The resulting API runtime is byte-for-byte the previously reviewed runtime:
`638f813fa3682caf7ccdbac556e557b65928c036836ce5221337b65bdacca150`.
There is no new application-code change in this packaging correction. Keep the
old failed patch directory and all its files. Extract this corrected package into
its new unique directory and supply the SAME original successful private release
directory when prompted. No subscriber, claim, nonce or private-release checkpoint
is replaced, and no uncertain deployment execution is replayed.

Python documents the [Windows zlib-ng change](https://docs.python.org/3.14/whatsnew/3.14.html#zlib)
and [ZIP compression methods](https://docs.python.org/3/library/zipfile.html#zipfile.ZIP_DEFLATED).

This small delta package repairs the existing API Lambda and preserves private API authorization. It requires the
ORIGINAL extracted `private-signup-repair-20261027-739404fe3d61` release directory,
including `.cloudshell-release-state.json`, `newsletter-runtime.zip` and its original
manifest. Keep that directory intact; it contains the accepted email claim and
successful signup checkpoint. Do not upload or paste its contents into chat.

## Confirmed defect

The deployed GET confirmation document returned `Referrer-Policy: no-referrer`.
A native browser form POST under that policy serializes `Origin` as `null`.
The same-origin validation then rejected POST `/confirm` with HTTP **403** and
`origin_denied`, before token validation, CONTROL reads or DynamoDB confirmation.

An isolated headless Edge test against local HTTPS using the exact archived
deployed HTTP module reproduced GET **200**, native POST **403**, `Origin: null`,
and a still-PENDING subscriber. With the corrected document the actual browser
sent its HTTPS Origin, POST returned **200** and the synthetic subscriber became
CONFIRMED. Both POSTs used the browser's real `action=confirm` form bytes, passed
through API Gateway-style base64 encoding. No email was sent. The original live
POST's HTTP status was not supplied, so this confirms the deployed browser defect
and its matching symptoms; further live status evidence can distinguish any
additional blocker.

The confirmation document now uses `strict-origin`: the HTTPS Origin survives,
while Referer contains no path/query/token. `Origin: null` and foreign origins are
still rejected. Base64 decoding, form parsing, query-bound token extraction, link
expiry, signature, nonce, CONTROL, provider suppression and atomic consent proof
remain enforced. GET never confirms or echoes the token. No DynamoDB transaction
condition has been weakened or changed.

References: [Fetch Standard: append an Origin header](https://fetch.spec.whatwg.org/#append-a-request-origin-header),
[Referrer Policy: strict-origin](https://w3c.github.io/webappsec-referrer-policy/#referrer-policy-strict-origin).

## Safe diagnostics

The browser failure document now displays HTTP status plus fixed phase/category,
also returned in `x-newsletter-phase` / `x-newsletter-result`. CloudWatch uses the
existing `chronoverse-newsletter-v2-api` group and bounded `newsletter_http` JSON.
No addresses, tokens, raw SDK messages, bodies, queries or signing material are logged.

| Status / phase | Meaning |
| --- | --- |
| 403 / origin / origin_denied | Old no-referrer page or foreign/null Origin; fresh approved testing must load a new unexposed confirmation document |
| 400 / body_decode or body_parse | Invalid encoding/form body |
| 400 / confirm_action | Missing/wrong deliberate confirmation action |
| 400 / confirm_token | Missing, conflicting, invalid, expired or wrong-purpose capability |
| 503 / confirm_control / gate_closed | Original registration/confirmation CONTROL gates are closed |
| 400 / confirm_pending / confirmation_ineligible | Pending nonce/proof no longer eligible, already consumed or suppressed |
| 503 / confirm_suppression | SES suppression/contact read failure; bounded permission/throttle/dependency category |
| 503 / confirm_transaction / dependency_validation | DynamoDB rejected an expression/value; no raw expression or values logged |
| 400 / confirm_transaction / confirmation_conflict | Atomic nonce/consent/suppression condition failed |
| 200 / confirm_transaction / confirmation_recorded | Confirmation committed; contact synchronization can now complete |

## One operator procedure

Upload `chronoverse-confirmation-fix.zip` to CloudShell and run the checksum-bound
command in the accompanying `EXECUTE.txt`. The script prompts for the EXISTING
successful release directory; do not select a new empty directory or the older
failed initial release. On rerun, keep the same patch extraction and checkpoint.

The procedure:

1. Verifies both manifests, accepted original signup checkpoint/claim, runtime
   hashes, unchanged private IAM routes/test-recipient restriction, historical
   isolation and disabled weekly schedules. It closes enrollment before deployment.
2. Reconstructs the new runtime from the exact existing ZIP, replacing ONLY
   `src/http.mjs`, `src/service.mjs` and `src/aws.mjs`. Dependencies and every other
   runtime file are identical. Exact reviewed ZIP bytes are copied from the base
   and delta; no recompression or dependency download occurs.
3. Inventories historical sets read-only across all list/describe pages without
   executing, deleting or treating them as the new deployment candidate.
   Requires `PREPARE CONFIRMATION FIX`, uploads one immutable versioned runtime,
   and prepares a new CloudFormation change set. Exactly **Modify ApiFunction**
   and **Modify HttpApi**, both **Replacement=False**, are permitted, subject to
   the property and complete processed-template checks above. The same private
   IAM route restrictions are now explicit in SAM; all other effective settings
   stay unchanged. Review and approve ONLY the newly printed exact change-set name.
4. Reads back the code, canonical source/processed templates and private route/
   integration configuration. It verifies the preserved original claim/checkpoint
   as historical evidence, keeps CONTROL closed and records DEPLOYMENT-RECEIPT.json.
   It does not run confirmation, unsubscribe or feedback tests with the exposed
   capability. Do not use older launchers to resume that email/token flow.

Failure closes enrollment. Rerun the SAME command only to resume/verify deployment.
No deployment rerun generates a capability, sends mail or marks fresh consent valid.

An uncertain CloudFormation execution is not automatically replayed. Wait for the
stack to stabilize and rerun the same command: the exact corrected API hash can be
recognized without re-executing. A failed/rolled-back uncertain execution stops for
inspection of its saved change-set ID. No subscriber cleanup is part of this patch.

The API now intentionally has a different code hash from the other four functions.
The old full launcher expects five identical hashes and must not be used to resume
this API-only patch or the exposed capability. Public
activation/weekly changes are outside this repair and are not performed.

## Controlled fresh-token test after deployment (separate approval)

This is a follow-on test protocol, not authorization performed by the ZIP. A
positive secure inbox/consent test necessarily needs a newly authorized enrollment
and fresh email delivery. The present no-email/no-reset instructions remain in
force until the operator explicitly approves that separate test.

1. Keep registration/confirmation CONTROL closed and weekly OFF. Privately verify
   that the exposed capability has expired before any shared confirmation gate is
   opened. Do not extend its expiry or merely re-sign its old pending nonce: the
   disclosed capability would remain usable. Early nonce invalidation would change
   the pending row and requires its own explicit approval; this package does none.
2. To preserve the original PENDING row and accepted claim unchanged, select a
   distinct operator-owned test enrollment/inbox with explicit authorization. The
   current SES grant is restricted to the original exact recipient. Any change to
   authorize a different test recipient must be separately reviewed and constrained
   to that exact address, never a wildcard or public signup. If that permission is
   absent, STOP; do not bypass it with an alias or hand-issued capability.
3. Only after approval, use the application's normal IAM-authenticated private
   registration flow once, producing a new random request nonce, a new immutable
   mail claim and a fresh inbox-delivered capability. Use a separate private test
   checkpoint; retain the original checkpoint and claims as historical evidence.
   Never paste the new URL/token into chat, terminal output or logs. No manual
   signing-key read, fabricated consent, direct confirmation write or reset is used.
4. In the controlled browser test, GET must leave that fresh record PENDING. The
   deliberate native form POST must return HTTP 200 and atomically record current
   policy/version/text, the NEW request nonce and confirmedAt >= awsRequestedAt,
   with provider suppression checks enforced and weekly OFF. Bind the consent proof
   to that new accepted provider claim/receipt. The old accepted claim is not proof
   for this new consent. Replaying the fresh capability must not confirm again.
5. Verify unsubscribe and originless one-click behavior for the fresh test identity,
   then managed feedback as separately approved. Confirm suppression is durable,
   the original pending record/claim are unchanged, and signing keys are unchanged.
   Close both enrollment gates and keep weekly OFF. Do not reuse the older launcher
   to mark the original exposed-token checkpoint successful. Public launch requires
   its own later approval and completed fresh-consent/unsubscribe/feedback evidence.

## Local validation

Regression tests replay normal and base64 browser form bodies through the actual
DynamoDB confirmation adapter with modeled transactions. They cover the original
null-Origin rejection, deliberate POST, fresh forward-only proof, delivery OFF,
single consumption, expiry, CONTROL, pending nonce, provider read failures,
transaction validation/conflicts and privacy-safe statuses. Deployment tests reject
replacement/unrelated resource changes and verify accepted-claim/checkpoint preservation.
Canonical comparisons accept object-key reordering and native OrderedDict trees,
while rejecting added/removed/modified resources, properties, values, IAM/route/
integration changes, scalar coercion and array reordering. Deployment completion
tests prove that no exposed-token continuation, consent attestation, enrollment
reopening, email, unsubscribe or feedback mutation can run from this package.

The offline package builder validates the exact base and both source hashes for
each replacement, packages the reviewed byte-copy delta, reconstructs the exact
runtime, verifies that ONLY the three named files differ, compiles the deployment
script and checks ZIP integrity. Nothing in local
validation deploys, commits, pushes, resets a subscriber or sends email.
