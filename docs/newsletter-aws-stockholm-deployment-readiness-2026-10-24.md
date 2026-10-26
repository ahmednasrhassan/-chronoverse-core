# Stockholm newsletter deployment readiness

24 October 2026. Region: **eu-north-1**. Branch: `master`; HEAD: `dea9254fb82b90076671d58e884dd58ba61eb1eb`.

**Local remediation update:** the confirmed confirmation-control gap below has been addressed in the [focused fix report](newsletter-confirmation-safety-fix-2026-10-24.md). The original audit observations below remain historical evidence. Confirmation activation now also requires durable boolean `CONTROL.confirmationEnabled=true`, checks approval in the consent transaction and consumes the token nonce. All infrastructure defaults remain disabled; live activation still requires the remaining owner/managed-service gates. The owner guide's control example has been updated; no production control record was created or changed.

**BLOCKED for live activation. The template passes local Stockholm validation and is suitable for a fresh, isolated, disabled stack after the inputs, account preflight and explicit provisioning approval below.** The original confirmation gap is documented below; consult the remediation update for its local fix and verification. No provisioning, website deployment or email is authorized by this report.

This runbook supersedes the proposed Ireland region and initial migration sequence in the [original owner guide](newsletter-aws-owner-guide-2026-10-24.md). Start with **zero active subscribers and no legacy import**. The original guide and implementation have been preserved unchanged.

## Evidence and limits

Reviewed [SAM template](../services/newsletter/template.json), the owner guide, runtime gates, contact synchronization, unsubscribe compatibility and migration entry points. `cfn-lint 1.58.0` completed offline for **eu-north-1**, exit 0, no diagnostics. All **32 combinations** of the five template switches matched their intended sending conditions. A separate, network-blocked in-memory probe confirmed both the empty-stack behavior and the confirmation gap described below. No full development/test/build cycle was repeated.

Local evidence is in ignored `.verification/newsletter-stockholm-readiness-20261024/`: `validation.json`, `cfn-lint.log`, `condition-matrix.json`, `confirmation-pause-probe.mjs` and `confirmation-pause-probe.json`. These contain no real subscriber records, keys or private mailing address. Runtime/template/guide hashes were recorded for preservation checks.

The following are **owner-confirmed**, not independently queried through AWS: verified domain/DKIM; production access and account sending enabled; quota **50,000 recipients per rolling day / 14 per second**; BOUNCE/COMPLAINT account suppression; `ContactLists: []`; `info@chronoversecapital.com` sender/support; corrected DMARC; mailing address selected privately. No AWS account API, subscriber data, dispatch endpoint or unsubscribe endpoint was accessed. Official public AWS documentation was consulted.

Effective deployment permissions, SCPs/boundaries, regional account quotas, name availability, secret contents and managed-service execution remain unverified. AWS CLI, SAM CLI and Docker are absent from this workstation; SAM build/package and a real CloudFormation change set have **not** been run. Local schema validation is not proof of a successful deployment.

## Disabled defaults and zero audience

| Control | Fresh-stack result |
| --- | --- |
| `RegistrationEnabled=false` | `/subscribe` fails closed before parsing an address or creating consent; website also remains code-paused |
| `ConfirmationEnabled=false` | Confirmation **email** disabled; confirmation-token consumption has the separate gap below |
| `DeliveryEnabled=false` | Planner/worker runtime dispatch rejected |
| `LegacyDispatchRetired=false`, `ComplianceApproved=false` | Additional independent send prerequisites remain unsatisfied |
| API/worker IAM | No `ses:SendEmail` grant with default conditions |
| Dedicated SES configuration set | `SendingEnabled=false`; account-wide SES sending stays unchanged |
| Weekly Scheduler | `DISABLED`; Monday 09:00 UTC expression retained |
| Planner/worker queue mappings | Disabled |
| `CONTROL` ledger item | Not seeded; its absence blocks subscription confirmation emails and digest dispatch |
| Contact list and ledger | New, empty resources; topic `weekly-research` defaults to `OPT_OUT` |
| Feedback/contacts mappings | Enabled for safety processing; no mail permission and nothing to process on a fresh empty stack |
| Alarm destination | Set `AlarmTopicArn` to empty initially; no email subscription or alert email is created |

The template has no custom resource, subscriber seed, import job or connection to Sanity. The migration CLI is not packaged as an automatic Lambda job. **Do not run migration apply, an SES import, a legacy export, or create a `CONTROL` item during provisioning.** A newly created stack therefore has zero contacts and zero active subscriber records. This is a source/template conclusion, not a claim about an already provisioned stack. Retrying against retained resources or importing an existing table/list would require a new review and does not qualify as this fresh-stack plan.

### Confirmed activation blocker: confirmation consumption bypasses the pause

Affected code: `services/newsletter/src/service.mjs`, `/confirm` branch. Unlike `/subscribe`, it does not call a runtime gate before transitioning a valid `PENDING` record to `CONFIRMED`. `ConfirmationEnabled` currently gates sending the confirmation email, not accepting the confirmation.

Reproduction used only the existing in-memory fixture: seed one synthetic pending record and a valid unexpired synthetic capability; set all five flags to `false`; remove `CONTROL`; call the service function for `/confirm`. Result: **200 / CONFIRMED**, with **zero mail-adapter calls and zero network calls**. The same token against an empty fixture returns 400; paused signup returns 503 and creates no record. No production endpoint was invoked.

Impact: after a future pause, an already issued link could still create an active consent record and contact synchronization could mirror it into SES. It cannot bypass the disabled delivery/IAM/configuration-set barriers to send mail. An untouched fresh stack has no pending records or valid issued capabilities, so this does not prevent isolated disabled provisioning.

Required fix before activation: gate the pending-to-confirmed mutation with the approved registration/confirmation controls and authoritative ledger control, keeping unsubscribe independent. Add focused regressions for every missing/false gate, absent control, a valid pending token during a pause, suppression precedence, and successful confirmation when approved. Decide whether already-confirmed idempotent acknowledgements remain readable during a pause. **No implementation change was made in this readiness review.**

## Stockholm resource and IAM review

All resource ARNs use `AWS::Region`/`AWS::AccountId`/`AWS::Partition`; no Ireland resource ARN is hardcoded into the template. Node.js 22 ARM64, the configured resource properties and SES event types pass the local regional schema checks. SES, Lambda and API Gateway publish Stockholm endpoints. [SES endpoints](https://docs.aws.amazon.com/general/latest/gr/ses.html), [Lambda endpoints](https://docs.aws.amazon.com/general/latest/gr/lambda-service.html), [API Gateway endpoints](https://docs.aws.amazon.com/general/latest/gr/apigateway.html), [supported runtimes](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html).

There are **45 authored resources**; SAM also generates API Gateway/Lambda permission resources, so the processed change set is the final inventory:

| Resources | Count / scope |
| --- | --- |
| DynamoDB ledger | 1, on-demand, `Audience` GSI, keys-only stream, PITR, encryption, TTL for temporary rate entries, deletion protection |
| SES contact list / configuration set / event destination | 3, new dedicated list and configuration; no identity resource |
| SQS queues | 4: plan, digest, feedback, shared failure queue; managed encryption, 14-day retention |
| SNS topic / topic policy / SQS subscription / queue policy | 4, SES → SNS → SQS only; no email subscription |
| Lambda functions / execution roles / log groups | 5 + 5 + 5; API, planner, worker, feedback, contacts; 256 MB / 60 seconds; logs retained 30 days |
| HTTP API | 1, three POST routes; burst 5 / rate 2 per second; no custom domain or DNS resources |
| Event source mappings | 4: three SQS plus filtered subscriber stream |
| Scheduler / execution role | 1 + 1; default schedule group; schedule disabled |
| CloudWatch alarms | 11: five Lambda errors, dead letters, held outcomes, API/provider/queue failures, throttling |

Runtime IAM review:

- API: scoped ledger Get/Put/Update, dedicated secret read, new-list contact read and regional account-suppression read. Conditional confirmation-only send grant restricted to the chosen identity/configuration-set ARNs and exact sender address.
- Planner: ledger Get/Put, `Audience` query, plan/digest enqueue and plan consume. No secret or SES send access.
- Worker: scoped ledger Get/Put/Update, dedicated secret and contact/suppression reads, digest consume; conditional digest send grant with the same identity/sender restrictions.
- Feedback: scoped ledger Get/Put/Update and feedback consume. No SES send or secret access.
- Contacts: scoped ledger access, Get/Create/Update on the **new contact list only**, stream consumption, account-suppression read and failure enqueue. No mail or suppression-delete permission.
- Scheduler: SendMessage only to planner/failure queues; trust scoped to this account and `schedule-group/default`, matching the documented Scheduler trust model. [Scheduler trust requirements](https://docs.aws.amazon.com/scheduler/latest/UserGuide/cross-service-confused-deputy-prevention.html).

The SES suppression read requires resource `*` and is region-restricted; DynamoDB `ListStreams` also uses `*`. Other grants are scoped to replacement resources. No subscriber/contact deletion, suppression removal, legacy Sanity credential or general administrator policy is supplied. DynamoDB transactions use the underlying Put/Update permissions. SES contact actions support contact-list ARNs. [SES IAM reference](https://docs.aws.amazon.com/service-authorization/latest/reference/list_sesv2.html).

These execution roles are distinct from the **deployment role**. The approved deployer needs artifact-bucket write/read and CloudFormation change-set/review/execute permissions; a reviewed CloudFormation service role needs create/read/update/rollback permissions for the resource types above, including creation/inline policies for the six new roles and narrowly scoped `iam:PassRole` to Lambda/Scheduler. Restrict stack/resource prefixes where supported; do not attach blanket administrator policies merely to bypass a failed deployment. Existing organization policies and any required permissions boundary must be checked by the owner; the template currently supplies no boundary. `CAPABILITY_IAM` is required because roles are created, but no explicit IAM `RoleName` requires `CAPABILITY_NAMED_IAM`. The reviewed change-set path does not need `CAPABILITY_AUTO_EXPAND`. [Change-set capability semantics](https://docs.aws.amazon.com/cli/latest/reference/cloudformation/create-change-set.html).

### Naming and quota preflight

Proposed stack name: **`chronoverse-newsletter-v2`**. It produces contact list/schedule `chronoverse-newsletter-v2-weekly`, configuration set `chronoverse-newsletter-v2-events`, and functions/log groups ending `-api`, `-planner`, `-worker`, `-feedback`, `-contacts`. IAM/table/queue/topic physical names are generated. Keep alternate stack names at most **55 characters** to respect the longest Lambda suffix; avoid underscores in the stack name.

Before packaging/execution, the owner must check metadata for existing stacks, retained resources, these SES/function/log/schedule names, available quotas and the artifact bucket. **SES documents only one contact list per account; the supplied empty regional list is favorable but must be rechecked.** Do not create the list manually or spin up another competing stack. A differently named existing list can also be a quota conflict. [SES list limits](https://docs.aws.amazon.com/ses/latest/dg/sending-email-list-management.html).

The five functions reserve **9 concurrency units total** (2/2/1/2/2). Confirm Stockholm can reserve nine additional units while retaining AWS's required unreserved pool and capacity for existing transactional functions. Reduced new-account quotas can block deployment; request a quota increase rather than silently weakening safety concurrency. [Lambda reservation constraints](https://docs.aws.amazon.com/lambda/latest/api/API_PutFunctionConcurrency.html).

## Existing identity and historical safety

Use `arn:aws:ses:eu-north-1:OWNER_ACCOUNT_ID:identity/chronoversecapital.com` after confirming the exact owner account/ARN. The template neither creates/updates the identity nor changes DKIM, MAIL FROM, DMARC, DNS, account sending settings or the identity's default configuration set. It uses a new per-message configuration set. **Do not assign the disabled newsletter configuration set as the domain/mailbox default:** that could affect unrelated transactional mail. Existing domain verification can be reused; no new DNS work is required by this stack. Sender-specific overrides/policies and eventual managed-service delivery remain subject to owner preflight/testing, without sending now. [Configuration sets and identity defaults](https://docs.aws.amazon.com/ses/latest/dg/using-configuration-sets.html), [default behavior](https://docs.aws.amazon.com/ses/latest/dg/managing-configuration-sets.html).

Historical Sanity records, consent evidence, suppressions, unsubscribes and existing SES suppression remain untouched. The new ledger retains consent/suppression without TTL; suppressed records lose audience membership. Existing provider opt-outs are not changed to opt-in. Imports, if separately approved later, produce HOLD/SUPPRESSED, never automatic active consent. No import is required to provision this empty stack.

The minimal `v1.` opt-out decoder remains and requires the **exact original key** as optional `legacyV1Key`. New keys cannot recover old links. The original key is not established as recovered. Unavailable/unknown historical links retain truthful support recovery; do not claim compatibility is operational until the key, routing and recovery process are verified. New v2 unsubscribe capabilities remain valid while sending is off; do not rotate the capability key without a reviewed compatibility plan.

Before website cutover or signup activation, separately inventory legacy deployment URLs, schedulers, Sanity webhooks, direct send endpoints and old SNS subscriptions/retries/dead letters. Local tombstones cannot disable immutable old deployments. Old HTTP feedback returns retryable 503, with finite provider retention; a staffed recovery path must preserve pending opt-outs. Historical suppression reconciliation may require a separately approved **suppression-only** migration before enrollment; a fresh ledger alone does not know Sanity opt-outs. Keep original evidence and ensure support recoveries become durable suppressions before any audience is eligible. Do not assert `LegacyDispatchRetired` or ledger `migrationComplete` merely because this new stack is empty.

## Exact deployment inputs

| Owner input | Required handling |
| --- | --- |
| AWS account ID and approved short-lived deployment session/profile | Confirm account and `eu-north-1`; no hardcoded access keys |
| Stack name | Proposed `chronoverse-newsletter-v2`; confirm no conflicting/retained resources |
| `IdentityArn` | Exact existing Stockholm domain identity ARN in that account |
| `SenderEmail` | `info@chronoversecapital.com` |
| `SecretsArn` | Dedicated same-account Stockholm Secrets Manager secret, AWS-managed `aws/secretsmanager` encryption for current IAM |
| Secret JSON `capabilityKey`, `websiteKey` | Two independent, cryptographically random values of at least 32 bytes, generated/stored privately only after approval; preserve key continuity; never fixture values or legacy credentials |
| Optional secret `legacyV1Key` | Exact recovered historical key only; omit if unavailable; never invent/replace it |
| `PostalAddress` | Owner-selected lawful mailing address entered privately; one line, 1–500 characters; do not put it in source, Git, screenshots, shell history or reports |
| Approved artifact S3 bucket | Same region, private/encrypted, approved prefix; existing approved bucket preferred; creation requires separate approval |
| CloudFormation service role ARN and deployment permissions | Owner-reviewed resource-scoped role; existing role preferred, creation separately approved |
| Five switch parameters | Explicit strings `false` for DeliveryEnabled, RegistrationEnabled, ConfirmationEnabled, LegacyDispatchRetired, ComplianceApproved |
| `AlarmTopicArn` | Empty string initially; notifications require later approval |

`PostalAddress` has `NoEcho`, but is resolved into Lambda environment variables. Authorized Lambda configuration readers can see it; it is not a Secrets Manager value in this implementation and eventually appears in approved outgoing mail. Keep access limited and obtain the owner's acceptance of that handling. NoEcho is not universal redaction. Keep private parameter files outside packaged code and source control, avoid debug logs/transcripts and do not save private values into `samconfig.toml`. [NoEcho limitations](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/parameters-section-structure.html).

No `NEWSLETTER_UNSUBSCRIBE_SECRET`, `SANITY_NEWSLETTER_WRITE_TOKEN`, `NEWSLETTER_SENDING_ENABLED`, SES SMTP password or long-lived AWS keys are needed by the replacement. Future website integration needs server-only `NEWSLETTER_AWS_API_URL` (stack output) and `NEWSLETTER_AWS_BRIDGE_KEY` (the same `websiteKey`). **Do not configure them in Vercel during provisioning.** Support is already configured in code; there is no separate support-mailbox stack parameter.

## Minimal deployment runbook — instructions only

### 1. Obtain approval for the first provisioning action

**First action requiring owner approval: create ONE dedicated Secrets Manager secret in eu-north-1, proposed name `chronoverse/newsletter-v2`, with privately generated `capabilityKey` and `websiteKey`, using `aws/secretsmanager`, no automatic rotation.** If metadata shows an appropriate dedicated secret already exists, review/reuse its ARN instead of replacing it. Add `legacyV1Key` only when provenance is established and separately approved. This action alone cannot send mail or import subscribers. It creates a billable secret, approximately $0.40/month plus API usage. No secret values have been generated here.

Owner Console path: select **Stockholm → Secrets Manager → Store a new secret → Other type of secret**, enter the two properties privately, select the managed encryption key, confirm the unused name, leave rotation off, review and store. Save only its ARN for the deployment operator. Do not alter any existing secret.

### 2. Complete preflight and prepare local artifacts

After approval for read-only account access, verify account ID/identity ARN, no contact list/name collision, nine spare reserved concurrency units, deployment-role permissions and private artifact bucket. No subscriber enumeration is needed. Install AWS CLI v2, SAM CLI and **Node.js 22** on the reviewed packaging workstation; this workstation currently has Node 24, so build with the runtime-matching toolchain. Use short-lived SSO/assumed credentials under an owner-selected profile. Do not run `sam init`, `sam deploy --guided`, or `--resolve-s3`; those can create/save unintended resources/settings.

From the repository root, create a restricted local `.newsletter-private/` directory (already Git-ignored). It is outside `services/newsletter`, so private parameter files are outside Lambda CodeUri. The following local validation/build commands do not authorize AWS resource creation:

```powershell
npm ci --prefix services/newsletter --ignore-scripts
sam validate --lint --template-file services/newsletter/template.json --region eu-north-1
sam build --template-file services/newsletter/template.json --build-dir .newsletter-private/build
```

Inspect the built artifacts: expected runtime modules/dependencies only; no `.env`, AWS/Vercel configuration, migration input, private parameters or address. Retain artifact/template digests privately for review. SAM packaging uploads code to S3 and requires explicit approval for artifact writes:

```powershell
sam package --template-file .newsletter-private/build/template.yaml --s3-bucket OWNER_APPROVED_ARTIFACT_BUCKET --s3-prefix chronoverse-newsletter-v2/20261024 --output-template-file .newsletter-private/packaged.yaml --region eu-north-1 --profile OWNER_APPROVED_PROFILE
```

Replace only the uppercase non-secret placeholders. No actual AWS identifiers or secrets are embedded in these instructions. Do not put private values inline in commands. [SAM package behavior](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-package.html).

### 3. Create a change set, without executing it

Privately create UTF-8 JSON file `.newsletter-private/stockholm-parameters.json`, using an editor, with all ten template parameters. Format is a JSON array of `{"ParameterKey":"...","ParameterValue":"..."}` objects. Populate the four required parameters from the table above, all five switches explicitly as `"false"`, and `AlarmTopicArn` as `""`. **The address belongs only in this private file or a private Console parameter field. Secret contents never belong here; use the secret ARN.** Do not print the file. Ensure the directory ACL limits access to the owner/operator. [CLI file parameters](https://docs.aws.amazon.com/cli/latest/userguide/cli-usage-parameters-file.html).

After separate change-set creation approval:

```powershell
aws cloudformation create-change-set --stack-name chronoverse-newsletter-v2 --change-set-name disabled-initial-20261024 --change-set-type CREATE --template-body file://.newsletter-private/packaged.yaml --parameters file://.newsletter-private/stockholm-parameters.json --capabilities CAPABILITY_IAM --role-arn OWNER_APPROVED_CFN_SERVICE_ROLE_ARN --region eu-north-1 --profile OWNER_APPROVED_PROFILE
aws cloudformation wait change-set-create-complete --stack-name chronoverse-newsletter-v2 --change-set-name disabled-initial-20261024 --region eu-north-1 --profile OWNER_APPROVED_PROFILE
aws cloudformation describe-change-set --stack-name chronoverse-newsletter-v2 --change-set-name disabled-initial-20261024 --query "Changes[].ResourceChange.{Action:Action,LogicalId:LogicalResourceId,Type:ResourceType,Replacement:Replacement}" --region eu-north-1 --profile OWNER_APPROVED_PROFILE
```

CloudFormation limits inline template bodies to 51,200 bytes: check the **packaged** file size first. If larger, upload only that non-secret template to the approved private S3 prefix and use its regional HTTPS `--template-url` instead of `--template-body`; never upload the parameter file. Change-set creation creates a review stack record, not the application resources. Stop on any failed validation, quota warning or unexpected conflict. [Create-change-set limits and behavior](https://docs.aws.amazon.com/cli/latest/reference/cloudformation/create-change-set.html).

Review the change set and processed template in a private session. Expected: **Add** actions only, limited to the 45 authored resources plus SAM-generated HTTP resources/permissions. Confirm no imports, replacements, deletion or mutation of an existing identity, account settings, DNS, Sanity or Vercel resources. Inspect IAM inline policies and all resolved false conditions: no send grant, SES configuration sending off, weekly schedule and dispatch mappings disabled. Leave feedback/suppression processing enabled. Confirm no custom resource seeds consent or `CONTROL`. Address-bearing resolved views must not be copied into tickets/chat/evidence. Review all CloudFormation preflight warnings; a successful change-set creation does not establish runtime behavior.

### 4. Execute only after owner approval of the reviewed change set

```powershell
aws cloudformation execute-change-set --stack-name chronoverse-newsletter-v2 --change-set-name disabled-initial-20261024 --region eu-north-1 --profile OWNER_APPROVED_PROFILE
aws cloudformation wait stack-create-complete --stack-name chronoverse-newsletter-v2 --region eu-north-1 --profile OWNER_APPROVED_PROFILE
aws cloudformation describe-stacks --stack-name chronoverse-newsletter-v2 --query "Stacks[0].{Status:StackStatus,Outputs:Outputs}" --region eu-north-1 --profile OWNER_APPROVED_PROFILE
```

Do not use `--disable-rollback`. These instructions intentionally contain no execute command for activation, subscriber import, email test, endpoint invocation or website deployment.

### 5. Post-provision verification without mail or subscriber reads

Use resource **configuration/metadata** in the Console, not test/invoke/publish controls or subscriber item browsers:

1. CloudFormation `CREATE_COMPLETE`, expected resource inventory/outputs, all five parameter flags false, no unexpected changes. Do not display the address or secret contents.
2. SES: newly created list/topic exists, OPT_OUT default, no import jobs initiated. Confirm initial zero audience through fresh-resource provenance; if independently checking a count, use only approved aggregate metadata, never `ListContacts` or DynamoDB item scans. DynamoDB `ItemCount` is approximate/delayed and is not standalone proof. Do not enroll even synthetic contacts in this production stack without separate testing approval.
3. Configuration set sending false; safety event destination enabled to exact SNS topic; only its SQS subscription. Account sending/identity verification/DKIM/default configuration unchanged.
4. New ledger: on-demand, PITR, deletion protection, stream and GSI correct; no seed/import performed. No `CONTROL` item should have been provisioned. Table/list are retained; suppression/consent are not TTL records.
5. Lambda: runtime/architecture, memory/timeout, roles and reservations correct; inspect only flag names/false values without dumping complete environment variables. API/worker policies contain no SendEmail grants. No production Lambda test invocation.
6. Weekly schedule DISABLED; planner/worker mappings disabled. Feedback and contacts mappings enabled; queue redrive, encryption, 14-day retention and source policies correct. Do not redrive or send messages.
7. Eleven alarms and five log groups exist; no alarm notification actions initially. Do not turn on body/header/query logging. Confirm the stack has generated no newsletter send activity using aggregate metrics; metrics alone do not prove absence across legacy deployments.
8. Website and legacy production settings unchanged; signup stays paused. Stop here. Record a **disabled infrastructure provisioned** assessment; live activation remains a separate approval.

## Cost review

Incremental planning budget for this **empty, disabled stack plus one dedicated secret: approximately USD $2–5/month**, excluding tax and existing account services/plans. There is no SES message charge while nothing sends. Rough standing components are one secret (~$0.40/month plus API calls) and 11 standard metric alarms (~$1.10/month at illustrative $0.10/alarm), plus small SQS polling/artifact storage/metadata costs. Regional rates, account credits and rounding can differ; confirm Stockholm in the AWS calculator before spend approval. Reserved concurrency has no standing compute charge; no provisioned concurrency, NAT, dedicated IP, VPC, WAF or custom domain is defined. An exposed HTTP API can incur usage charges even when sending is paused; throttles limit requests but do not make it free. Enabled safety consumers and later retained logs/ledger/PITR also incur usage/storage charges. [Secrets pricing](https://aws.amazon.com/secrets-manager/pricing/), [CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/), [SQS pricing](https://aws.amazon.com/sqs/pricing/), [Lambda concurrency](https://docs.aws.amazon.com/lambda/latest/dg/lambda-concurrency.html).

The original guide's later active-audience scenarios remain **estimates**, not activation approval: ~1,000 active readers $5–9/month, 10,000 $12–20, 100,000 $82–97, assuming 4.345 digests/month, 10% new confirmations, small messages and SES Essentials. AWS lists Essentials $0.16/1,000 messages versus à-la-carte $0.10/1,000; the owner's actual plan is unknown and the template does not change it. Existing Pro/Enterprise fixed fees, if any, are outside the incremental estimate. Custom metrics/reputation metrics, growing durable history, retries and actual processing time can increase the ranges. [SES current pricing](https://aws.amazon.com/ses/pricing/).

**The 100,000-reader example is not operationally supported by the current owner quota without further design/review.** One-second pacing could attempt more than 50,000 messages in a rolling day; the three-attempt 429 policy does not implement daily-quota scheduling. Before any activation, reserve daily/rate headroom for confirmation and unrelated transactional email, set an approved initial audience cap below remaining daily capacity, and review quota-aware scheduling for growth. No quota change is needed to provision an empty disabled stack.

## Rollback and release gates

Before change-set execution, stop and delete only the unexecuted change set after approval; no application resources have been created. Preserve approved secret/artifact provenance. During creation, allow standard CloudFormation rollback and inspect metadata/events privately. **Retain policies can leave ledger, queues, SES list/configuration and logs after failure or stack deletion**; do not assume rollback makes them disappear. Inventory retained resources before retrying, especially SES's single contact list. Do not delete/recreate them to clear a naming error.

For the provisioned disabled stack, leave it disabled and correct through a newly reviewed change set. Do not delete the stack as a substitute for stopping sending. If a later activated release needs rollback, keep unsubscribe/feedback and all suppression/audit/idempotency evidence available; apply an approved send-off change first, then a reviewed website/infrastructure rollback. Do not promote old sender-enabled website versions, restore an old audience over suppressions, rotate capability keys, clear claims or blindly redrive queues.

Before **live activation**, all of these remain required: fix/test the confirmation pause; verify effective managed-service IAM/workflows under separately approved isolated tests; reconcile legacy dispatch and pending opt-outs; establish durable historical suppression recovery; confirm legal/consent/privacy/retention/address handling and an incident owner; choose alert delivery with approval; verify daily/rate quota headroom; approve website management routing while keeping signup paused; then separately approve enrollment and ultimately digest scheduling. Nothing in the owner-confirmed SES facts proves these gates complete.

**First approval requested by this plan is narrowly scoped to the dedicated Stockholm secret described in step 1. Stack provisioning and later activation need their own reviewed approvals. No live action was taken.**
