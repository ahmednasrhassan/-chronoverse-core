# Independent newsletter acceptance and website release

Status: **paused production website released; public activation NO-GO**.
After separate owner approval, the exact OIDC provider/invocation role and paused
website commit `140ce8859fed4a96ee42c78530383cc137f272b9` were deployed and verified.
The real production build passed, the single production-workload signed empty
request reached the closed AWS registration guard (503), and the live website
remains paused. Vercel master automatic deployment remains false. No registration,
email, consent-gate opening or subscriber mutation was performed during this work.
The single unsubscribe-page source correction below is not deployed; targeted
unsubscribe remains executor-blocked, with the dedicated identity CONFIRMED.

Latest release, 29 October: the separately approved paused subscription-page
refinement is **deployed and verified** on commit
`dc51a59a02dca96287fce82439a0f0b3ac7d82c7`. Production deployment
`dpl_9P4oj9FxqBrfim66Ek1xaDdUnGHz` is READY with the canonical domains assigned
and no alias error. The page displays Chronoverse Capital Weekly, disabled
Subscribe, privacy information, English content and the unavailable notice,
with no admission form/inputs. The website API returns 503 registration_paused.
Public signup and delivery remain disabled. The previous `140ce8859` production
deployment remains available as the rollback target for this refinement.

## Completed subscription-page refinement

The existing `/newsletter` route now presents **Chronoverse Capital Weekly** in
the site's established charcoal, cream and mauve palette and Geist typography.
It reuses the existing site layout, header, footer, skip link and newsletter
entry points. The responsive page stacks on small screens and uses two columns
on desktop. No new route, subscription store, design package or AWS resource was
introduced. Existing SEO helpers retain the canonical `/newsletter` URL, English
locale, social metadata and RSS identity.

The primary CTA is exactly **Subscribe**. While the code pause is true, it is
disabled and no email input, consent input or form is rendered. The pause notice
reads: "Newsletter subscriptions are temporarily unavailable. Please check back
soon." Both the reusable form and its submit handler independently enforce the
code pause; the existing API still returns before reading the body or loading
credentials. `NEWSLETTER_SIGNUPS_PAUSED` remains true.

The prepared form has required email validation, an unchecked required consent
checkbox, accessible labels, validation/status announcements, visible focus
styles, an email keyboard hint, a loading state, and immediate duplicate-submit
protection. The exact deployed consent text/version are unchanged. Accepted
requests only instruct eligible readers to check for a confirmation link;
uncertain results stay generic and cannot be retried from that form instance.
The page explains double opt-in and secure email unsubscribe links, and links to
the existing privacy policy. No tokenless unsubscribe URL was added.

Validation for this refinement:

- 14 focused component, API, consent, pause and newsletter SEO tests passed with
  inherited service credentials removed and networking blocked. Real React DOM
  tests cover invalid email/missing consent, loading, duplicates, accepted,
  unavailable and uncertain outcomes, and a stale form encountering the pause.
  No live subscriber or email was used.
- `npm run typecheck` passed (`next typegen` and `tsc --noEmit`).
- Targeted ESLint passed for all eight changed source/test files.
- `npm run build -- --webpack` exited 0 after compilation, TypeScript, all 117
  static pages, optimization and build traces. This is a complete build result.
- The resulting local production server returned GET /newsletter=200 with the
  site header/footer, one main landmark, correct canonical, English document,
  disabled Subscribe button and no admission inputs. Empty JSON POST
  /api/newsletter returned 503 registration_paused with no-store; the privacy
  policy returned 200. The local server was stopped after verification.
- Fresh read-only AWS results during this refinement confirmed all three
  CONTROL values strictly Boolean false and both recurring schedules DISABLED.
  No AWS code, IAM, SES policy, schedule, subscriber or claim was modified.

`vercel.json` retains only `git.deploymentEnabled.master=false` and an empty cron
list; no GitHub Actions deployment workflow exists in this checkout. Before this
source push, Vercel still listed the approved `140ce8859` production deployment
as latest, with no deployment for the prior documentation-only push. Subsequent
owner approval authorized the manual **paused** deployment; its live checks have
now passed as recorded above. Public activation still requires completed
unsubscribe acceptance, its approved browser correction, explicit SES recipient
policy approval and separately approved website/AWS activation. Weekly delivery
and recurring scheduling require their own approval. None is enabled here.

## Final completion review, 29 October

### Investigated preflight STOP; original command retired

The owner executed the pinned `3d985a4baea0fcbfe8609dacd36b373027be1d38`
operation exactly once. It stopped in preflight with SafetyStop,
check=unqualified_proxy_target and changeSetId=null. Evaluation had not reached
deploy() or acceptance(): no runtime upload, change set, deployment or unsubscribe
occurred. Do not replay that original command or its script SHA256
`6c3c506e02c179b5694f09508ad1f8fdfb14245dfdac5047b96df2ac0634efc8`.

Authenticated read-only GetRoutes/GetIntegrations returned exactly 11 routes and
11 used integrations on lh71lvbqi8. Every IntegrationUri is the API Gateway Lambda
Invoke URI:

`arn:aws:apigateway:eu-north-1:lambda:path/2015-03-31/functions/arn:aws:lambda:eu-north-1:957261948953:function:chronoverse-newsletter-v2-api/invocations`

The wrapped function ARN is exact and unqualified. All integrations report
AWS_PROXY, integration method POST, payload version 2.0 and no CredentialsArn.
The three registration routes retain AWS_IAM; all eight management routes retain
their expected authorization. Only the old URI==bare-function-ARN condition
failed. This is a script assumption defect, not an API Gateway configuration
defect. AWS documents the
[Lambda invocation URI format](https://docs.aws.amazon.com/apigateway/latest/developerguide/integration-request-basic-setup.html)
and [integration credentials behavior](https://docs.aws.amazon.com/apigatewayv2/latest/api-reference/apis-apiid-integrations.html).

The corrected preflight accepts only two exact strings: the already accepted
unqualified function ARN and its exact eu-north-1 invocation wrapper. It does not
strip qualifiers, decode arbitrary URIs or use substring/suffix matching. All
proxy/method/payload/credential/authorization checks remain intact. Inventory
checks also reject duplicate routes/IDs, missing targets and unused/orphaned
integrations. Sanitized live metadata is retained as the focused regression
fixture `services/newsletter/test/fixtures/api-gateway-integrations-2026-10-29.json`;
it contains infrastructure metadata only, with no credentials or subscriber data.

The remainder was reviewed without changing deployment or acceptance logic.
Read-only AWS evidence confirms UPDATE_COMPLETE, a 29,002-byte JSON source
template below the inline limit, the expected SAM ApiFunction/CodeUri shape,
versioned artifact bucket, exact PATCHED API and four BASE hashes, and all five
functions Active/Successful. All three CONTROL values remain Boolean false and
both recurring schedules remain DISABLED. Historical/claim checks had already
passed before routes() failed. No keys, capabilities or subscriber contents were
read for this diagnosis. Runtime assembly, actual future change-set scope,
permissions, timing and post-execution outcomes remain mandatory fail-closed
checks; they are not proven by this review. A replacement commit/SHA256-pinned
command is prepared only after the regression checks pass. It has not executed.
Validation completed: 96 focused tests passed with networking blocked, including
the actual 11-route/integration fixture, bare-ARN compatibility, rejection of
foreign/qualified targets and credentials, inventory anomalies and pagination.
Targeted ESLint, Python syntax and fixture JSON validation passed. Every script
AST node outside Operation.routes() remains identical to the retired pinned
source; deployment, signing, unsubscribe and recovery logic were not changed.

The API still reports the previously verified PATCHED runtime SHA256, not the
pending unsubscribe correction. A read-only live GET using a synthetic,
non-authorizing review capability returned 200 with no-referrer and no capability
echo. This independently confirms that the one-line strict-origin correction is
still appropriate. The exact immutable deployed archive was checked read-only:
replacing only that conditional produces the already reviewed HTTP module hash.
No new archive was created locally and the original artifact was not modified.

No targeted subscriber write has occurred during this review. The dedicated
identity's last authoritative state remains CONFIRMED with SES OPT_IN; SUPPRESSED,
SES opt-out, audience removal and live idempotency are **not claimed**. Two later
attempts at a fresh read-back failed at the connector transport with
`Transport send error / HTTP request failed` for the ChatGPT MCP backend. Earlier
AWS policy/account/control reads in this same review succeeded; do not infer an
application fault or request another authorization from that transport error.
All successful current-review CONTROL reads were strictly false and both
recurring schedules were DISABLED. Nothing in this work opened or changed them.

Available execution paths were checked without retrying blocked crypto imports.
The local process has no AWS credential/profile files or credential environment;
the browser connection has no attached browser. The connected AWS SDK does not
support the required signing/archive libraries. No secret was retrieved and no
capability was minted through these limited executors. No credential transfer,
direct ledger suppression, SES update, new minting endpoint or new infrastructure
was used to bypass the limitation.

The owner's permitted fallback is one pinned CloudShell operation:
`services/newsletter/scripts/complete-unsubscribe-acceptance.py`. It is an actual
completion operation, not a deployment of the old launcher or activation flow.
It requires explicit distinct recipient/preserved-identity arguments. The exact
operator command must pin both its Git commit and SHA256, fetch it into memory,
verify it, and execute it once in authenticated eu-north-1 CloudShell. It writes
no local checkpoint, receipt or ZIP file. Its authorized sequence is:

1. Verify account, exact resources, strict closed gates, disabled schedules,
   all 11 IAM/proxy routes, historical row and existing confirmation claims.
2. Read the live versioned PATCHED artifact. Verify its pinned archive/source
   hashes; produce one necessary corrected runtime in memory; compare every
   member to prove only src/http.mjs changed. Upload under a new immutable,
   content-addressed S3 key, preserving every existing object/version.
3. Copy the current live source template, changing only ApiFunction.CodeUri.
   Require one non-replacing ApiFunction Code change and an otherwise identical
   processed template. Keep all parameter values, IAM and other four runtimes.
   Freshly recheck isolation before executing once. Reconcile exact stack
   ChangeSetId, UPDATE_COMPLETE, processed template, Lambda hashes/version and
   routes; never require a consumed change set to remain retrievable afterward.
4. Obtain the existing signing secret only inside that authenticated process.
   Mint the existing purpose/nonce-bound unsubscribe format in memory. Use the
   genuine HTTPS unsubscribe endpoint: read-only review/cancel first, then one
   deliberate unsubscribe POST, followed by repeat and RFC8058 one-click checks.
   Require authoritative SUPPRESSED and preserved other subscriber fields;
   observe the existing stream's SES OPT_OUT/UnsubscribeAll synchronization and
   absence from the Audience index using both exact index keys.
5. Require stable suppression/audit on repeated calls, unchanged historical row
   and claims, closed gates and disabled schedules. Output sanitized result,
   runtime SHA/version and change-set identity only. No emails are sent.

**The original operation stopped once in preflight; the corrected revision has
not executed.** An uncertain provider result stops immediately
without execution retry, rollback, new change set or unsubscribe retry. On STOP,
return only its sanitized JSON for independent read-only reconciliation; do not
rerun it. An already corrected runtime also stops for reconciliation rather than
adopting an uncertain previous execution. Native browser automation is unavailable;
the operation explicitly reports NOT_EXERCISED for that part instead of claiming
a browser test. The source correction, real HTTP Origin path and existing
isolated regression tests do not falsely become browser acceptance evidence.

Validation: the focused service/public HTTP/confirmation/closer/published Sanity
readiness/completion run passed 90 tests. An added regression for an uncertain
CloudFormation execution then passed in the 11-test completion subset. Targeted
ESLint and Python syntax passed. The 14 website tests, TypeScript and complete
local production build were accepted from dc51a59; its new Vercel production
build also completed successfully. No website source changed again, so those
checks were not repeated as a broad suite.

SES account production access and sending are enabled, enforcement is HEALTHY,
the domain is verified and DKIM is SUCCESS. HTTPS DNS read-back found all three
SES DKIM CNAMEs correct and a DMARC monitoring policy (p=none). The initial local
DNS resolver could not resolve these records; the HTTPS resolver succeeded.
Account bounce/complaint suppression is enabled. These are readiness checks,
not a new email or a guarantee of inbox placement.

Live IAM review confirms two API inline policies retaining exact test-recipient
grants and the exact sender/identity/configuration set. The worker has no
ses:SendEmail grant and no attached managed policy while delivery is disabled.
Do not claim either role can serve the public audience yet.
`services/newsletter/deployments/public-sending-permission-proposal.json` records
the **unapplied, approval-required** scope: add one narrowly bounded SendEmail
inline policy to each of the existing API and worker roles, only for
info@chronoversecapital.com, eu-north-1 and the existing SES identity/configuration
set. Preserve all existing grants; rollback removes only the two new inline
policies after closure. IAM cannot inspect DynamoDB confirmation state: public
recipient access is broader and needs explicit owner approval. The existing
application enforces double opt-in, current confirmed eligibility, SES opt-in,
ledger/provider suppression, claims and feedback checks. The proposal's read-only
IAM simulations allowed the intended sender/public recipient and denied a wrong
sender, wrong region and missing recipient context. No policy was applied, and
no gate/schedule activation is bundled with this proposal.

## Live reconciliation

The dedicated owner-approved test identity remains CONFIRMED, with no suppression
markers, one delivery-audience entry, and an SES weekly OPT_IN contact. The earlier
manual unsubscribe did not complete. The historical subscriber and claim must
remain untouched. Private identities, nonces, claims and capabilities are not
release fixtures or documentation.

The API code still matches reviewed PATCHED package SHA256
`638f813fa3682caf7ccdbac556e557b65928c036836ce5221337b65bdacca150`.
All three CONTROL gates are strictly false; weekly and daily discovery schedules
are disabled. The already successful CloudFormation update is not replayed.

Targeted unsubscribe and repeat/one-click idempotency calls have owner approval.
Execution is blocked by the current connected AWS executor: standard `hmac`,
`hashlib` and `base64` imports are rejected, and the signing libraries are not
pre-imported. An authenticated Lambda Invoke without a capability was tested and
rejected with HTTP 400, without mutation. No signing key was retrieved, no
capability was created, and no substitute DynamoDB suppression was performed.
This is an execution-environment limitation, not evidence of a handler failure.
Do not reimplement crypto, expose a key to chat/terminal arguments, add a minting
endpoint, or ask the owner to repeat registration or CloudShell loops.

Resume only through a trusted authenticated executor supporting the existing
reviewed capability signer. With gates closed, capture the historical row/claim
identities privately; obtain the dedicated identity's current unsubscribe nonce;
hold a fresh purpose-bound capability privately; check review GET/cancellation
without POST; perform the approved unsubscribe POST once; then repeat POST and
one-click to establish stable suppression. Observe the existing stream's SES
OPT_OUT/UnsubscribeAll synchronization and absence from the Audience index. Recheck
historical row/claim preservation, all gates false and both schedules disabled.
Never reset, resend, clear claims or manually opt an address back in. These are
remaining acceptance steps, not results claimed by the offline tests.

## Website integration source

The old external link to AWS `/register` cannot admit ordinary visitors because
registration remains AWS_IAM. The prepared form submits a same-origin JSON consent
request to `/api/newsletter`. The code pause is checked before body reads or
credential loading. Missing/wrong consent, hostile origins, oversized requests and
unrecognized fields fail before transport. The displayed consent version/text are
tested against the AWS implementation.

The server signs one fixed POST `/register` using short-lived session credentials.
Only AWS validates consent, records PENDING, sends a confirmation, and manages
subscribers. No bridge secret, subscriber store, AWS credential, confirmation link
or token is shipped to the browser. No upstream HTML/diagnostics are reflected.
Only HTTP 202 becomes a generic check-inbox result; uncertain results are held
without application retries. The form locks after one attempt and never claims
the recipient is subscribed. Native form fallback uses POST, so an address cannot
enter a default GET query string.

The Vercel-specific credential adapter requests a 900-second STS session through
OIDC, requires a production environment and a role in the existing AWS account,
and uses one STS attempt. No static AWS credential fallback exists. Its official
reference is [Vercel AWS OIDC federation](https://vercel.com/docs/oidc/aws).
`NEWSLETTER_REGISTRATION_ROLE_ARN` is server-only configuration; it is not a secret
key and must never be prefixed NEXT_PUBLIC_. Vercel supplies the workload OIDC
token. Do not put an owner's personal AWS credentials in website settings.

`services/newsletter/website-registration-role-template.json` is **deployed** in
the companion stack `chronoverse-newsletter-website-access` (CREATE_COMPLETE).
Fresh inventory established that neither provider nor role existed before this
separately approved creation; no existing resources were adopted or overwritten.
The stack creates exactly one provider and one invocation role.
Team/project parameters are pinned to `chronoverse-capital`. It trusts
exact audience and production project subject values through StringEquals. Its
only grant is execute-api:Invoke on the existing account/API's
`$default/POST/register`; it cannot invoke other paths, send SES mail, read secrets,
change gates or access DynamoDB. The account/API stage is `$default`; the team and
project were independently read from the Vercel connection. CloudFormation's
read-only ValidateTemplate passed with CAPABILITY_NAMED_IAM. The template does not
update existing newsletter resources. AWS retrieves the provider CA thumbprint
when ThumbprintList is omitted, as documented in the
[CloudFormation OIDC reference](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-iam-oidcprovider.html).

The generic validation and SigV4 transport take an injected temporary-credential
provider; only `vercelRegistration.ts` imports a Vercel package. A Cloudflare move
must supply a separately reviewed short-lived workload identity adapter and
server runtime with the required SDK/Web API support, then run the same contract
tests. A Cloudflare adapter/deployment is not claimed to exist. The newsletter's
content links, Lambda execution, storage, suppression and schedules stay in AWS
and have no dependency on a website cron or publication webhook.

The existing AWS sourceIp rate limit sees the server's egress address: visitors
sharing one egress IP share its ten-requests/hour bucket. Rotating egress IPs can
have separate buckets; this is not a global ten/hour website limit. The focused
spoofed-forwarding-header regression passed. No live load or email test was run.
Do not forward an untrusted client fingerprint or weaken this guard.

Live SES GetAccount reports production access, sending enabled and HEALTHY
enforcement. IAM simulation, with sender/recipient and eu-north-1 region context,
allowed the approved test identity but implicitly denied an arbitrary public
recipient and an unexpected sender, for both the identity and configuration-set
resources. All simulations had no missing context. Current API sending policies
retain exact-recipient conditions without wildcard recipients. Public eligibility
is therefore blocked by these permissions despite SES account production access;
no policy was broadened and no email was sent.

## Weekly readiness and postal-address finding

Two identical unauthenticated, published-perspective Sanity queries found one
eligible post after the real cutover `2026-10-24T21:00:00.000Z`. The versioned public
projection is `services/newsletter/test/fixtures/published-readiness-2026-10-28.json`,
SHA256 `8ef3a5ee25ceb39bc25d1817312a981b031fbeda70e571e57717b05febb15e24`.
It contains public article fields only; drafts, versions and the pinned historical
baseline remain excluded by the production query.

Offline tests run that actual revision through discovery, manifest validation,
campaign selection, rendering, per-recipient claims, duplicate delivery handling,
suppression after planning, contact synchronization, permanent bounce and complaint
deduplication. The clock advances **only in memory** to Monday 2 November 09:10 UTC
to test the next closed issue; no live consent date, cursor or checkpoint is
backdated. The prior Monday boundary yields no job for this later publication.
Synthetic test contacts and mail adapters cannot send real email; Node networking
is blocked. These tests do not prove SES production digest deliverability or
replace the outstanding live unsubscribe acceptance.

Confirmation source inserts the postal address once in each MIME alternative;
the SES adapter does not add a confirmation footer. A live configuration check
found no repeated whole-address block. The focused regression confirms one
occurrence in text and HTML. No duplicate-rendering defect was established, so
the confirmation email builder and postal-address configuration were not changed.

A separate review identified the native unsubscribe form's `no-referrer` policy
as retaining the same Origin:null failure mode previously corrected for
confirmation. A focused regression failed on the existing source, then passed
after applying `strict-origin` to both management review pages. This omits the
token-bearing path/query while retaining the HTTPS origin. Origin validation,
capability validation, IAM, cancellation behavior and one-click processing are
unchanged. This is source-only; no deployed API update is claimed.

The exact deployed PATCHED `http.mjs` is retained under
`deployments/patched-runtime-source/src/http.mjs`, SHA256
`56ed52d8bd33cfefb21f65d5035c528316c260845a1081a63de5518cd1b6e637`.
The pending `src/http.mjs` SHA256 is
`5cdf5812e4c161c53e072c337c0ce00b362b1a762a56d6c22bcfac97ab7fd8be`.
The sanitized source-provenance manifest explicitly maps the deployed reference
and marks this delta SOURCE_ONLY_NOT_DEPLOYED; it does not alter the recorded
deployed package hash or become an execution receipt. All other API runtime
modules and all BASE reference modules remain unchanged.

## Separate production approval gates

Validation: 58 focused service/provenance/role tests and 17 focused website,
registration and search-identity tests passed, with networking blocked. The
website TypeScript check passed. The earlier default Turbopack attempt remains a
timeout, not a pass. The follow-up full `npm run build -- --webpack` exited 0:
compilation, TypeScript, all 117 static pages, optimization and build traces
completed. Running that production build locally verified GET /newsletter=200,
pause notice present, email input absent, and POST /api/newsletter with empty JSON
returned 503 registration_paused. This proves the built pause; it is not a live
Vercel SigV4 result. No application source changed after that build; the follow-up
source changes are the IAM template, its test and this operational documentation.

1. Finish and evidence the already approved targeted live unsubscribe through a
   secure executor. Require SUPPRESSED, SES opt-out, no audience entry, stable
   repeat/one-click results and historical preservation.
2. The owner has now approved deployment of the one-line browser correction;
   execution remains blocked by the lack of a trusted authenticated executor
   supporting the required signing/archive operations. The local SDK reports
   CredentialsProviderError; the browser runtime lists no connected browser;
   the AWS connector rejects hmac/hashlib/base64/zipfile imports. No capability,
   new ZIP or update was created. Do not rerun the completed confirmation
   deployment or old launchers, or export credentials to chat/command arguments.
   Until that correction is deployed and browser-verified, direct canonical
   unsubscribe browser acceptance remains incomplete.
3. Completed under separate approval: exact OIDC provider/invocation-only role,
   production-only role ARN, paused production website release and one signed
   closed-guard request from the production build workload. This proves production
   workload federation and reachability; the paused public handler intentionally
   does not load credentials. No browser consent or email test was repeated.
4. SES production account eligibility is verified; a separate decision is still
   required for the exact-recipient sending restrictions. Test permission is not authorization
   for arbitrary public addresses. Do not broaden recipient permissions silently.
5. The separately approved paused website release is verified below; preserve
   `git.deploymentEnabled.master=false`. Public activation requires an explicit code
   change to NEWSLETTER_SIGNUPS_PAUSED plus independently approved AWS gates.
6. Weekly production sending and recurring schedule activation require separate
   approval after the above evidence and final content/compliance review. Keep
   deliveryEnabled=false and both recurring schedules disabled until then.

No receipt, checkpoint, private release package or historical runtime identity is
rewritten by this Git release. Existing provenance remains in
`services/newsletter/deployments/deployment-reviewed-2026-10-28.json`; these website
sources and the pending browser correction do not claim to change the already
deployed API artifact.

## Concrete paused-release approval scope

The Vercel connection successfully read the existing team/project and production
deployment. Team `team_GmY2uikxuEpKNIcvxfufKta6`, project
`prj_eaR0kIu4T56IlK1nLyCCxkYsvFHk`, both named `chronoverse-capital`.
The retained prior production rollback target is deployment
`dpl_4yxazgLBXmzRSet1ZcVaFg1RYoDL`, commit
`df57410cdd96e3922cc0c22d25613a867f44eb9e`.

The owner separately approved, and execution completed, these exact operations:

- Create companion stack `chronoverse-newsletter-website-access` containing only
  OIDC provider `https://oidc.vercel.com/chronoverse-capital` with audience
  `https://vercel.com/chronoverse-capital`, and role
  `arn:aws:iam::957261948953:role/chronoverse-newsletter-website-registration`.
  Trust only subject
  `owner:chronoverse-capital:project:chronoverse-capital:environment:production`.
  The sole permission is execute-api:Invoke on
  `arn:aws:execute-api:eu-north-1:957261948953:lh71lvbqi8/$default/POST/register`.
  Stop on an unexpected pre-existing provider/role; do not adopt or overwrite it.
- Configure that role ARN in production-only NEWSLETTER_REGISTRATION_ROLE_ARN and
  confirm the project's OIDC team issuer is enabled. No static credentials,
  newsletter keys, preview trust, SES grants or existing AWS role changes.
- Manually deploy the reviewed Git SHA to the existing Vercel production project
  with the verified Webpack build command and code signup pause intact. Keep
  git.deploymentEnabled.master=false. Verify the actual resulting commit, READY
  status, live pause and closed website admission; retain the previous deployment
  for rollback. This approves paused release only, not public registration.

Before requesting that production deployment, independently read strict-false
CONTROL and disabled schedules. A private production-workload assertion can run
after the Webpack build, using the existing official credential provider and
SigV4 libraries: sign exactly one POST /register with the literal body `{}` and
the AWS origin; require HTTP 503 and fail the release on any other result or
uncertainty. No address or consent is supplied, so even unexpectedly open gates
cannot create a subscriber or email. Do not retry. No public health/probe endpoint
is added. The paused public endpoint continues to return before loading AWS
credentials. Label this as production-workload SigV4 reachability, not a completed
browser registration or live email test.

## Verified paused production release

- Companion stack: `chronoverse-newsletter-website-access`, CREATE_COMPLETE.
  Its provider URL/audience, production-only subject and sole inline invocation
  policy match the committed template. No managed policies are attached and no
  other inline policy exists. IAM simulation allows only POST /register; GET
  /register, POST /subscribe, /confirm and /unsubscribe are implicitly denied,
  as are SES sending, secret reads, DynamoDB updates and Lambda invocation.
- Vercel team issuer was enabled and the exact public role ARN was configured
  only for production. No static credentials or new secret values were used.
- Deployment `dpl_DYLzpYmoV9T1XnkJaptNALKZrBn3` is READY on Git commit
  `140ce8859fed4a96ee42c78530383cc137f272b9`, target production, without alias
  errors. Its aliases include `chronoversecapital.com` and
  `www.chronoversecapital.com`.
- The full Vercel Webpack build, TypeScript, 117 static pages and build traces
  completed. The existing server signer ran once in that production build
  workload, using short-lived OIDC credentials and the literal body `{}`;
  the only probe output was `503`. No address/consent was supplied. This is
  production-workload SigV4 reachability, not a browser registration or email test.
- After READY, the project build command was reset successfully to
  `npm run build -- --webpack`, removing the one-time probe from future builds.
  No public probe endpoint or probe source file was added.
- Live `https://chronoversecapital.com/newsletter` returned 200, contained the
  paused notice and no email input. One same-origin empty JSON POST to the
  website `/api/newsletter` returned 503 with code `registration_paused`, before
  the AWS transport. This request cannot register or send mail.
- Final independent AWS reads found all three CONTROL values Boolean false,
  both recurring schedules DISABLED, API Active/Successful with the original
  reviewed PATCHED package SHA256, and the dedicated identity still CONFIRMED.
  No subscriber, historical claim, SES permission or deployed API code changed.

The owner selected connection of the existing authenticated AWS browser, but the
browser connection still reported no attached browsers. This is not an expired
AWS connector authorization: the SDK reads above succeeded. Until a trusted
signing/archive-capable executor is actually connected, the already approved
unsubscribe and one-line API correction cannot safely execute. No cryptographic
restriction was bypassed and no substitute direct suppression was performed.
