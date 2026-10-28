# Independent newsletter acceptance and website release

Status: **public release NO-GO**. Source preparation and isolated acceptance are
complete for the scope below; live unsubscribe and production ingress acceptance
are not complete. No AWS deployment, registration, email or activation was
performed during this work. Vercel master automatic deployment remains false.
The single unsubscribe-page source correction below is not deployed.

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
not deployed**. It references an existing reviewed team OIDC provider and trusts
exact audience and production project subject values through StringEquals. Its
only grant is execute-api:Invoke on the existing account/API's
`$default/POST/register`; it cannot invoke other paths, send SES mail, read secrets,
change gates or access DynamoDB. Exact team/project/provider binding and AWS stage
must be reviewed before any separately approved role creation. The template does
not create the provider or update existing newsletter resources.

The generic validation and SigV4 transport take an injected temporary-credential
provider; only `vercelRegistration.ts` imports a Vercel package. A Cloudflare move
must supply a separately reviewed short-lived workload identity adapter and
server runtime with the required SDK/Web API support, then run the same contract
tests. A Cloudflare adapter/deployment is not claimed to exist. The newsletter's
content links, Lambda execution, storage, suppression and schedules stay in AWS
and have no dependency on a website cron or publication webhook.

The existing AWS sourceIp rate limit sees the server's egress address: its
conservative shared ten-requests/hour bucket remains in effect. Do not forward
an untrusted client fingerprint or weaken this guard to improve throughput.

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
website TypeScript check passed. The
default Next.js production build did not finish its compile stage within ten
minutes and was stopped; this is not a passing build or a diagnosed application
failure. A completed production build remains required before release.

1. Finish and evidence the already approved targeted live unsubscribe through a
   secure executor. Require SUPPRESSED, SES opt-out, no audience entry, stable
   repeat/one-click results and historical preservation.
2. Separately review/approve the one-line unsubscribe browser correction for a
   future API release, preserving the current infrastructure and all ledger
   state. Do not rerun the completed confirmation deployment or old launchers.
   Until that correction is deployed and browser-verified, direct canonical
   unsubscribe browser acceptance remains incomplete.
3. Review the exact OIDC issuer/audience/subject, existing provider and stage;
   separately approve/configure the invocation-only role and server role ARN.
   Verify a signed closed-guard request from the actual website runtime with no
   consent/email before considering public release.
4. Review SES account production eligibility and the existing exact-recipient
   sending restrictions. Current test-recipient permission is not authorization
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
