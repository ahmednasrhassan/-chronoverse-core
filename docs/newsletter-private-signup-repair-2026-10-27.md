> Historical preparation record. The AWS confirmation patch was successfully executed and reconciled on 28 October 2026. See [the current Git synchronization review](newsletter-git-sync-2026-10-28.md) and [sanitized provenance](../services/newsletter/deployments/deployment-reviewed-2026-10-28.json). Do not run the deployment, recovery, ZIP, old-token or activation commands below. Receipt finalization and fresh-token consent testing remain separately unapproved.

# Private signup repair

This artifact updates the existing stack only, using CloudShell credentials for account
957261948953, eu-north-1. It does not recreate resources, reset CONTROL, replace keys,
activate public registration, publish the website, commit, push, or enable schedules
during private repair. The same ZIP includes a separate activation continuation
requiring explicit approval after the durable live checks pass. Neither launcher
runs Git or deploys the website.

Upload the single ZIP to CloudShell and execute the supplied checksum-verified command.
Keep the ORIGINAL extracted failed release directory and its hidden
`.cloudshell-release-state.json`. Supply that directory when prompted. The original
runtime/checksums, target, attempted private checkpoint and historical baseline must
match the pinned failed release. Nothing is inferred from an empty SUB inventory.

Review and approve each actual CloudFormation change set (disabled, then private test).
Add/Remove/replacement and unexpected resource identities stop execution. The existing
`chronoverse-newsletter-v2-api` group receives API access logs with status and integration
status only, plus Lambda diagnostics with bounded phase/reason, native request ID and
encoding flag. No URLs, queries, email addresses, IPs, headers, request/response bodies,
SDK messages or capability links are logged. API Gateway auth failures and throttles
appear in `newsletter_gateway`; handler failures appear in `newsletter_http`.

The demonstrated defect was rejection of a valid API Gateway base64 POST body before
parsing. Reproduction against the exact failed runtime SHA-256 `a4414c220392ab4e6a4121cb57b3cacfb90261cb49bfab67318cbda9867094dc`
produced GET 200 / POST 400 without reaching the internal handler. The corrected
wrapper produced GET 200 / POST 202 using identical synthetic requests and no email.
The fix strictly decodes at most 4096 UTF-8 bytes and clears the encoding flag
only when passing normalized JSON into the internal handler. GET never used this path.
The failed live request's status/encoding were not captured, so this is a reproduced
defect, not a proven attribution of that particular request to transport versus IAM,
validation, CONTROL, DynamoDB or SES. No sender, SES permissions or signing key changed.

| Status | Evidence to inspect |
| --- | --- |
| 400 | Handler body_decode/body_parse/consent/identity or invalid management capability |
| 401 | Gateway authentication or legacy bridge authentication |
| 403 | Gateway IAM authorization/signature; handler origin/context validation |
| 415 | Handler unsupported content type |
| 429 | Gateway throttle; application anti-enumeration rate denial still returns generic 202 |
| 500/502 | Gateway integration/Lambda invocation status, including initialization failure |
| 503 | Handler phase plus fixed fault category: CONTROL/configuration, dependency permission/throttle, provider rejection or uncertain send/ack |

The signed POST uses the same exact URL, Origin, form content type and body bytes for
botocore SigV4 and urllib transport, with CloudShell's frozen execution credentials and
`execute-api` / `eu-north-1`. Signed GET success does not prove permission for a POST
method ARN. The launcher saves native gateway request ID (when available), actual HTTP
status, method, signing mode and an allowlisted result only; response bodies are neither
read nor logged. The API handler trusts only API Gateway v2 sourceIp, never proxy headers.
Once gates/consent pass, the write sequence is email/client rate counters, provider
suppression/contact reads, atomic pending+audit, immutable claim, second gate/pending
check, SES send and durable acknowledgement. Diagnostics distinguish each of these
stages. Missing subscriber rows plus healthy SES do not establish which stage failed.

Recovery holds CONTROL closed, checks all admission routes use AWS_IAM, verifies runtime
hash/timeout/stability, drains earlier invocations, and reads every Ledger page twice.
ANY attributable row (including SUB, RENEW, immutable MAIL claim in ANY state, request,
consent/suppression audit, provider event or email rate counter) blocks a fresh attempt.
Existing SES contact or suppression also blocks it; read failures stop closed. The
pinned failed runtime commits a permanent request audit and confirmation claim before
SES, so a missing SUB alone is insufficient but absence of all those immutable records
establishes no accepted/uncertain SES confirmation from this request, provided they have
not been manually deleted. The operator must explicitly attest that and approve ONE
recovery after seeing the proof. Unknown other runtimes are not accepted.

The singleton recovery authorization is conditional, durable and has no TTL. The
original `signupAttempted=true` is preserved. Authorization is consumed before POST;
lost acknowledgements hold the attempt, and no code resets or automatically resends it.
Keep other operators from submitting private enrollment while this procedure runs.
After arming, evidence is read again, SUB/RENEW absence and CONTROL are checked atomically
with consuming the authorization. The response's actual HTTP status is saved and printed
before failure handling. Network errors are explicitly uncertain. Redirects are refused.

After the single approved private request, use the real inbox confirmation email:
verify GET only displays the review page, then deliberately POST confirmation. Follow
the prompts for Ledger/SES acceptance, actual Delivery event, unsubscribe, and managed
SNS/SQS synthetic complaint and permanent-bounce suppression (clearly identified as
synthetic, not actual SES complaints/bounces). Browser POST and email-client one-click
POST without Origin are both checked. No campaign is sent. The authorized test
mailbox stays suppressed; the first suppression reason/time remain intact.
Successful completion writes `PRIVATE-REPAIR-RECEIPT.json` and closes enrollment again.
Failure also closes enrollment and leaves every claim, subscriber and checkpoint intact.

If recovery blocks: inspect the original enrollment/immutable claim and saved HTTP
evidence; do not delete records, reset checkpoints or resend. If a request was accepted,
complete that existing confirmation instead. A consumed uncertain recovery is a stop
requiring inspection, not permission for a second attempt. If close itself fails, the
operator must set only existing CONTROL registrationEnabled/confirmationEnabled false
(deliveryEnabled remains false) and verify all schedules disabled immediately.

After private verification, use the SAME extracted release directory:

1. Run `python3 run-verified-activation.py public`. It reads the actual durable test
   evidence again, requires `OPEN VERIFIED PUBLIC SIGNUP`, displays the real public
   change set for approval, and opens AWS enrollment while weekly delivery stays OFF.
   It generates `newsletter-release.json` for this exact runtime/audience receipt.
2. After explicit approval to commit/push the website change, run
   `git apply --check /path/to/website-activation.patch` then
   `git apply /path/to/website-activation.patch` in the website repository. Copy the
   generated `newsletter-release.json` to `public/newsletter-release.json`. Review
   and deploy these two files through the normal website process. The patch only
   changes the existing pause switch; the visible Subscribe link goes directly to
   AWS and collects no email or secrets on the website. No bridge is introduced.
3. Run `python3 run-verified-activation.py weekly --website-sha <deployed-commit-sha>`.
   The launcher checks the exact live marker and Subscribe link, rechecks durable
   test evidence/content approvals/empty queues, and requires approval of BOTH actual
   future schedule change sets. Delivery opens last after runtime/schedule readback.
   The 72 historical article exclusions, max 10 articles, immutable issue/recipient
   claims and fresh double-opt-in eligibility stay unchanged. No campaign is invoked.

Weekly exceptions pause delivery and disable the recorded schedules before closing
enrollment. An uncertain schedule execution is never automatically replayed. Public
or weekly activation cannot be approved by merely waiting or rerunning private tests.

Build a replacement artifact locally without AWS access:

```powershell
python -B services/newsletter/scripts/package-signup-release.py --private-signup-repair --out releases/newsletter-recovery/release
python -B services/newsletter/scripts/seal-signup-release.py releases/newsletter-recovery/release --zip releases/newsletter-recovery/chronoverse-newsletter-recovery.zip
```

The sealer verifies all manifests, current runtime/procedure bytes, exact locked
dependency versions, Python syntax, disabled template defaults and data retention.
Its sibling `EXECUTE.txt` contains the checksum-bound CloudShell extraction/run command.
Extraction preserves an existing directory and checkpoint when resuming.

AWS documents [HTTP API base64 handling](https://aws.amazon.com/blogs/compute/handling-binary-data-using-amazon-api-gateway-http-apis/)
and [HTTP API access logging](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-logging.html).
