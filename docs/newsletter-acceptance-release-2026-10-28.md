# Independent newsletter acceptance and website release

Status: **public release NO-GO**. Source preparation and isolated acceptance are
complete for the scope below; live unsubscribe and production ingress acceptance
are not complete. No AWS deployment, registration, email or activation was
performed during this work. Vercel master automatic deployment remains false.
The single unsubscribe-page source correction below is not deployed.
Follow-up: the full Webpack production build and local production-server checks
have now passed. The new provider/role and paused production website deployment
still require separate owner approval; live unsubscribe remains executor-blocked.

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

`services/newsletter/website-registration-role-template.json` is **source only,
not deployed**. Live IAM inventory found no OIDC providers, so the reviewed scope
now creates exactly one provider and one invocation role, under separate approval.
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
3. Approve the exact new OIDC provider and invocation-only role below, then
   configure the production-only server role ARN under that separate approval.
   Verify a signed closed-guard request from the actual website runtime with no
   consent/email before considering public release.
4. SES production account eligibility is verified; a separate decision is still
   required for the exact-recipient sending restrictions. Test permission is not authorization
   for arbitrary public addresses. Do not broaden recipient permissions silently.
5. Review the website build and deployment target for this Git source while
   preserving `git.deploymentEnabled.master=false`. A separately approved website
   release may deploy paused first. Public activation requires an explicit code
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
Production is READY at deployment `dpl_4yxazgLBXmzRSet1ZcVaFg1RYoDL`, commit
`df57410cdd96e3922cc0c22d25613a867f44eb9e`; retain that exact rollback target.

Separate approval is required for these concrete operations:

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

After approval, independently verify provider/role trust and allowed registration
invocation, with unrelated paths/actions denied. No production deployment or new
IAM resource was created in this review. All CONTROL gates remain false, both
recurring schedules remain disabled, and the live API retains the original
reviewed PATCHED package SHA256.
