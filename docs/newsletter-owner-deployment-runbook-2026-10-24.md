# Local independence revision supersedes these historical artifacts

The [25 October independence guide](newsletter-aws-independence-2026-10-25.md) describes the current source, new private S3 manifest contract, AWS-owned public routes, approval/cutover and origin inputs. Do not execute the existing Change Set or deploy the old ZIP/template as this revision. Those artifacts remain preserved; new packaging/validation/change-set approval is required. No AWS operation was performed by the independence task. The historical approval boundaries below remain, but old resource counts (42 translated), six-module/nine-input allowlists and required website/RSS-routing gates are superseded: current source has eight runtime modules/eleven build inputs, 38 authored/expected 50 translated resources, and no mandatory website release dependency.

# Owner runbook: disabled Stockholm newsletter deployment

24 October 2026. **Instructions for future approvals, not authorization to execute AWS actions.** This runbook supersedes earlier instructions to create a secret or choose Ireland. The owner already created `chronoverse/newsletter-v2`; use its existing ARN. Do not retrieve, regenerate, rotate, replace or copy its values.

Current cost-optimized, quota-compatible release: `E:\cv-nl-cost-20261024-192828`. Evidence: `.verification/newsletter-minimum-cost-20261024-192828Z`. See the [minimum-cost review](newsletter-minimum-cost-2026-10-24.md), [current inventory](newsletter-minimum-cost-inventory-2026-10-24.json) and preserved [quota compatibility report](newsletter-lambda-quota-compatibility-2026-10-24.md). Both earlier release roots are obsolete artifacts retained as evidence; the original isolated SAM tooling can still be reused. Deploy the current template and runtime together: alarms now expect `SafetyFailure`. For minimum expenditure, defer provisioning while activation blockers remain unresolved.

## 1. Local-only results and command boundaries

Already completed locally:

- Node **22.23.4**, SAM CLI **1.170.0**, isolated tooling and a fresh production dependency install.
- `npm ci --omit=dev --ignore-scripts --no-audit --no-fund`; `npm ls --all --omit=dev` without dependency problems.
- `sam validate --lint` and `sam build` for `nodejs22.x` / ARM64 / `eu-north-1`.
- Full repository regressions and backend regressions against the SAM-built dependency tree.
- Package inspection, deterministic ZIP creation/readback, handler imports, marshalling and disabled-control smoke checks.

`npm ci` downloads public npm dependencies and writes local files. SAM validation/build here were guarded against AWS API calls and Python networking; npm lifecycle scripts, telemetry and automatic npm updates were disabled. These commands did not upload or provision anything. Do not substitute `sam sync`, `sam package` or `sam deploy` for a local build. Do not run `sam local invoke` merely to check a package; an invoked application can call real services unless separately isolated.

Only nine allowlisted source inputs were staged: service `package.json`, corrected `package-lock.json`, `template.json`, and six runtime modules (`aws`, `domain`, `handlers`, `rss`, `service`, `discovery`). Website files, environment files, migration tools/data, tests, documentation, backups and installed repository dependencies were excluded.

The isolated SAM equivalent of the local commands was:

```powershell
# Local only. Use Node 22 and the isolated SAM installation/environment.
$LocalRoot = 'E:\cv-nl-cost-20261024-192828'
npm ci --prefix "$LocalRoot\source-release" --omit=dev --ignore-scripts --no-audit --no-fund
sam validate --lint --template-file "$LocalRoot\source-release\template.json" --region eu-north-1
# A new, empty build directory is required; SAM can clear its build directory.
sam build --template-file "$LocalRoot\source-release\template.json" --build-dir "$LocalRoot\build-new-review" --no-cached --region eu-north-1
```

The actual CLI was invoked through `python -m samcli` with an isolated Python path and an AWS-denying guard. Tool/evidence paths are recorded in the report. The original `build1` output is preserved. The approved release ZIP/template are already prepared; do not replace them with a fresh uninspected build. Any source/artifact change requires renewed inspection and hashes before upload.

## 2. Approval A — AWS metadata preflight, no secrets or subscriber reads

**Stop before these commands until the owner approves live metadata inspection.** Use an existing approved short-lived owner session and AWS CLI v2; do not enable Organizations, Control Tower or advanced account features to obtain credentials. AWS CLI v2 is not installed by this preparation. Console metadata checks are an alternative if API access is restricted.

The quota is already owner-confirmed as ten; no increase is required for the revised disabled template. The next proposed AWS metadata action selects the existing secret ARN **without retrieving its values**:

```powershell
aws secretsmanager describe-secret --secret-id chronoverse/newsletter-v2 --region eu-north-1 --query '{ARN:ARN,Name:Name,KmsKeyId:KmsKeyId,DeletedDate:DeletedDate}' --output json --no-cli-pager
```

The revised functions reserve **zero** executions. The three SQS mappings are capped at two each; streams use one batch per shard and HTTP throttles remain best effort. All share the regional pool; none guarantees capacity for unsubscribe. At approved preflight, inspect other workloads and optionally refresh `aws lambda get-account-settings --region eu-north-1 --query AccountLimit --output json --no-cli-pager` for current pool usage. Do not apply the superseded `>=109` requirement or reintroduce reservations. A paid-plan upgrade is not authorized or needed for this template correction. [Quota/concurrency review](newsletter-lambda-quota-compatibility-2026-10-24.md)

With metadata inspection approved:

```powershell
# Stop on native AWS CLI failures even in Windows PowerShell 5.1.
$ErrorActionPreference = 'Stop'
$AwsExe = (Get-Command aws.exe -CommandType Application -ErrorAction Stop).Source
function aws {
  & $AwsExe @args
  if ($LASTEXITCODE -ne 0) { throw 'AWS command failed; stop before any next action.' }
}
$Region = 'eu-north-1'
$Stack = 'chronoverse-newsletter-v2'
$AccountId = (aws sts get-caller-identity --query Account --output text --no-cli-pager).Trim()
# Billing metadata only; use Billing Console if this command is unavailable.
aws freetier get-account-plan-state --region us-east-1 --no-cli-pager
$SecretMeta = aws secretsmanager describe-secret --secret-id chronoverse/newsletter-v2 --region $Region --query '{ARN:ARN,Name:Name,KmsKeyId:KmsKeyId,RotationEnabled:RotationEnabled,DeletedDate:DeletedDate}' --output json --no-cli-pager | ConvertFrom-Json
$SecretsArn = $SecretMeta.ARN
$SecretPattern = '^arn:aws:secretsmanager:eu-north-1:' + [regex]::Escape($AccountId) + ':secret:chronoverse/newsletter-v2-[A-Za-z0-9]{6}$'
if ($SecretsArn -notmatch $SecretPattern -or $SecretMeta.DeletedDate) { throw 'Wrong secret/account/region or pending deletion; stop.' }
$IdentityArn = "arn:aws:ses:eu-north-1:${AccountId}:identity/chronoversecapital.com"
aws sesv2 get-email-identity --email-identity chronoversecapital.com --region $Region --query '{Verified:VerifiedForSendingStatus,DKIM:DkimAttributes.Status}' --no-cli-pager
aws sesv2 get-account --region $Region --query '{Production:ProductionAccessEnabled,Sending:SendingEnabled,Quota:SendQuota,Suppression:SuppressionAttributes,VDM:VdmAttributes}' --no-cli-pager
aws sesv2 list-contact-lists --region $Region --no-cli-pager
aws cloudformation list-stacks --region $Region --query 'StackSummaries[?StackStatus!=`DELETE_COMPLETE`].{Name:StackName,Status:StackStatus}' --no-cli-pager
```

These commands obtain metadata only. Never add `get-secret-value`, `batch-get-secret-value`, secret-version value inspection, `list-contacts`, subscriber queries, queue message reads or imports. The billing API uses its global endpoint region; all application resources remain in Stockholm.

Confirm in the dashboards:

- Billing: Free Plan expiry, remaining credits, credit expiry and eligible service/features. Review the actual SES pricing plan independently of the AWS account plan: Essentials has no fixed fee; Pro/Enterprise currently add $105/$500 per account/region/month, plus usage. Verify actual Billing charges, add-ons and remaining shared allowances privately; do not change any plan. The existing secret costs $0.40/month before credits, even without this stack. The paused new stack adds about $1.06-1.20/month gross under the documented model; Free Tier and credits are separate, not guaranteed permanent savings. Stop at any upgrade/paid-service prompt; no upgrade is authorized.
- Secrets Manager: existing secret name, ARN, account, region, deletion/rotation metadata and encryption key. Its JSON contract is `capabilityKey`, `websiteKey`, optional **verified original** `legacyV1Key`. Values remain private and uninspected. Do not add a guessed legacy key. An absent/default AWS-managed key is the intended setup; if a customer-managed KMS key is used, stop for a narrowly scoped `kms:Decrypt`/key-policy review. This template does not supply that grant.
- SES: retain the verified identity, DKIM and existing account suppression; check no competing contact list and no planned paid add-ons. **Do not set the disabled newsletter configuration set as the identity's default**, which could affect transactional mail.
- Lambda/SES/Scheduler/CloudWatch: no conflicts with `${Stack}-api`, `-planner`, `-worker`, `-feedback`, `-contacts`, the five `/aws/lambda/...` log groups, SES `${Stack}-weekly`, `${Stack}-events` and Scheduler `${Stack}-weekly`. No active stack does not prove there are no retained or manually created resources. SES's contact-list quota must remain available.
- IAM: approve a CloudFormation execution role and narrowly scoped caller permissions. The deployment caller does not need secret-value access. An execution role that does not yet exist requires its own reviewed IAM creation approval; it is outside the application stack.

## 3. Approval B — artifact bucket and uploads

**AWS writes and storage consumption start here. Not executed.** First prefer an existing owner-approved general-purpose S3 bucket in Stockholm, with private access and SSE-S3 encryption. An approved bucket name is still required. If none exists, obtain explicit approval for creating and hardening a new one before proceeding:

```powershell
$Bucket = Read-Host 'Approved unique artifact bucket name'
# Run this creation block only for a separately approved NEW bucket.
aws s3api create-bucket --bucket $Bucket --region $Region --create-bucket-configuration LocationConstraint=eu-north-1 --no-cli-pager
aws s3api put-public-access-block --bucket $Bucket --public-access-block-configuration 'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true' --region $Region --no-cli-pager
aws s3api put-bucket-ownership-controls --bucket $Bucket --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]' --region $Region --no-cli-pager
aws s3api put-bucket-encryption --bucket $Bucket --server-side-encryption-configuration 'Rules=[{ApplyServerSideEncryptionByDefault={SSEAlgorithm=AES256}}]' --region $Region --no-cli-pager
aws s3api put-bucket-versioning --bucket $Bucket --versioning-configuration Status=Enabled --region $Region --no-cli-pager
```

Do not apply these changes to an existing bucket without an additional review. Retain approved release objects for rollback; do not add expiration/deletion rules during this procedure. The bucket is **not** created by the newsletter template. SSE-S3 avoids adding a paid customer-managed KMS key.

Before any upload, compare the ZIP SHA-256 with the local manifest:

```powershell
$LocalRoot = 'E:\cv-nl-cost-20261024-192828'
# Reuse the isolated SAM installation; this function is for the APPROVED AWS
# phase, not the AWS-denying local build environment.
$SamTools = 'E:\cv-nl-20261024-154636\sam'
function sam {
  & python -c 'import site,sys; site.addsitedir(sys.argv.pop(1)); from samcli.cli.main import cli; cli(prog_name="sam")' $SamTools @args
  if ($LASTEXITCODE -ne 0) { throw 'SAM command failed; stop.' }
}
$env:SAM_CLI_TELEMETRY = '0'
$ExpectedZipHash = '3a407cc8b2cd8cc584baa8bf52d9cf44e98ab2a49d07ab22f90e04ff3011e92b'
if ((Get-FileHash -LiteralPath "$LocalRoot\packages-release\newsletter-runtime.zip" -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ExpectedZipHash) { throw 'Artifact changed; stop.' }
$Prefix = 'newsletter-v2/cost-20261024-192828'
# LOCAL directory only. Do not enter any address/secret into shell command text.
$PrivateDir = Join-Path 'E:\chronoverse-app\-chronoverse-core-master' '.newsletter-private'
New-Item -ItemType Directory -Path $PrivateDir -Force | Out-Null
$CurrentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
icacls $PrivateDir /inheritance:r /grant:r "${CurrentUser}:(OI)(CI)F" 'SYSTEM:(OI)(CI)F'
$Packaged = Join-Path $PrivateDir 'newsletter-packaged-cost-20261024.yaml'
# UPLOADS the inspected shared ZIP. It does not execute a stack.
sam package --template-file "$LocalRoot\release-template.json" --s3-bucket $Bucket --s3-prefix $Prefix --output-template-file $Packaged --region $Region
```

The template references one shared ZIP for five functions. Do not package the repository, backups, tool installation or a private configuration directory. Inspect the packaged template privately: only intended S3 code references may replace local ZIP references; five switches must remain `false`, address/secret inputs must remain parameter references, and no identity or secret resource may appear. Do not use `--force-upload`, `sam deploy`, `sam sync` or automatic execution.

Use only `packages-release/newsletter-runtime.zip` under the current cost release root. Older release ZIPs/templates and partial packaging attempts are preserved evidence, not upload candidates. The current ZIP combines byte-matching SAM-built first-party modules with the unchanged, previously inspected locked dependency archive. Fresh `npm ci` through SAM, the new SAM build and backend tests against its installed dependencies are independently checked; every final ZIP entry is hashed/read back.

## 4. Private parameters during approved provisioning

After Approval B/preflight, enter the selected lawful mailing address **privately**. No actual address or secret value is supplied by this repository or report. Do not use a residential address that has not been approved for public email publication. Do not paste it into chat, Git, CLI arguments, transcripts or screenshots.

```powershell
$ParamsPath = Join-Path $PrivateDir 'newsletter-parameters-cost-20261024.json'
if (Test-Path -LiteralPath $ParamsPath) { throw 'Private file already exists; review it privately rather than overwrite.' }
$SecurePostal = Read-Host 'Approved public mailing address, one line' -AsSecureString
$PostalPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePostal)
try {
  $Postal = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($PostalPtr).Trim()
  if (-not $Postal -or $Postal.Length -gt 500 -or $Postal -match "[\r\n\x00]") { throw 'Invalid postal address format.' }
  $Parameters = @(
    @{ParameterKey='SecretsArn'; ParameterValue=$SecretsArn},
    @{ParameterKey='SenderEmail'; ParameterValue='info@chronoversecapital.com'},
    @{ParameterKey='IdentityArn'; ParameterValue=$IdentityArn},
    @{ParameterKey='PostalAddress'; ParameterValue=$Postal},
    @{ParameterKey='DeliveryEnabled'; ParameterValue='false'},
    @{ParameterKey='RegistrationEnabled'; ParameterValue='false'},
    @{ParameterKey='ConfirmationEnabled'; ParameterValue='false'},
    @{ParameterKey='LegacyDispatchRetired'; ParameterValue='false'},
    @{ParameterKey='ComplianceApproved'; ParameterValue='false'},
    @{ParameterKey='AlarmTopicArn'; ParameterValue=''}
  )
  [IO.File]::WriteAllText($ParamsPath, ($Parameters | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($PostalPtr)
  $Postal = $null; $Parameters = $null; $SecurePostal.Dispose()
}
```

The private file is plaintext protected by the directory ACL and Git ignore; do not include it in artifacts/backups submitted for review. `NoEcho` masks CloudFormation parameter displays; it does **not** hide a Lambda environment value from authorized configuration readers. The template places the address in Lambda environment configuration and never in outputs/source. Preserve appropriately restricted access and private input provenance. No secret JSON values go into this parameter file—only the existing ARN.

## 5. Approval C — create a change set, then review

**Creates AWS control-plane state, including a CREATE stack placeholder. Not read-only and not executed here.** Choose an approved existing CloudFormation service role; do not grant blanket administrator or secret-value access. The report/inventory specifies the required resource families, runtime roles and rollback scope.

```powershell
$CfnRoleArn = Read-Host 'Approved CloudFormation execution role ARN'
$ChangeSet = 'disabled-cost-20261024-192828'
$TemplateArgs = @('--template-body', "file://$Packaged")
if ((Get-Item -LiteralPath $Packaged).Length -gt 51200) {
  # Additional approved S3 upload if the packaged template exceeds the API limit.
  aws s3 cp $Packaged "s3://$Bucket/$Prefix/template.yaml" --sse AES256 --region $Region --no-cli-pager
  $TemplateArgs = @('--template-url', "https://s3.eu-north-1.amazonaws.com/$Bucket/$Prefix/template.yaml")
}
aws cloudformation create-change-set --stack-name $Stack --change-set-name $ChangeSet --change-set-type CREATE @TemplateArgs --parameters "file://$ParamsPath" --capabilities CAPABILITY_IAM --role-arn $CfnRoleArn --tags Key=Application,Value=chronoverse-newsletter-v2 --region $Region --no-cli-pager
aws cloudformation wait change-set-create-complete --stack-name $Stack --change-set-name $ChangeSet --region $Region
aws cloudformation describe-change-set --stack-name $Stack --change-set-name $ChangeSet --region $Region --query '{Status:Status,Execution:ExecutionStatus,Changes:Changes[].ResourceChange.{Action:Action,Id:LogicalResourceId,Type:ResourceType,Replacement:Replacement}}' --no-cli-pager
```

Review the final processed change set in CloudFormation privately. Expect **38 authored / 42 locally translated resources**, including three generated API invoke permissions and one API stage. The actual managed change set is authoritative. Expect only additions to the dedicated stack, no imports, no modifications/deletions of existing resources, no identity/secret/bucket creation, no migration or seed resource, all sending/Scheduler switches false, IAM send grants absent, and default SES configuration-set sending false. Do not use `--include-property-values` or dump resolved Lambda environments into shared logs. Stop on unexpected resources, replacements, permission expansions, invalid names, free-plan prompts or unconfirmed quotas. `CAPABILITY_NAMED_IAM` and `CAPABILITY_AUTO_EXPAND` are not required by this template. [Change-set semantics and template size](https://docs.aws.amazon.com/cli/latest/reference/cloudformation/create-change-set.html)

## 6. Approval D — execute only the reviewed disabled change set

**Provisions resources and consumes account credits. Requires a separate explicit approval of the actual change set.**

```powershell
aws cloudformation execute-change-set --stack-name $Stack --change-set-name $ChangeSet --region $Region --no-cli-pager
aws cloudformation wait stack-create-complete --stack-name $Stack --region $Region
aws cloudformation list-stack-resources --stack-name $Stack --region $Region --no-cli-pager
```

Post-provision inspection is metadata only: verify runtime/architecture/60-second timeout and **no function reservations/provisioned concurrency**; each SQS mapping maximum two; stream parallelization factor one per shard; schedule `DISABLED`; planner/worker mappings disabled; feedback/contacts mappings enabled; dedicated SES configuration-set sending false; topic default `OPT_OUT`; table encryption/PITR/deletion protection and retention; no seeded `CONTROL`, no automatic subscriber import and no seed/contact-creation job. The send gate is created only by an approved runtime send attempt, not seeded here. Use table/list metadata and creation provenance, not a subscriber scan or contact export. Verify five log groups retain 14 days and four alarm groups cover eight underlying metrics: regional Lambda Errors/Throttles, failure-queue depth, SafetyFailure and all three queue ages plus contact-stream age. No success custom metrics should be created by the new runtime. Regional execution alerts can include unrelated functions. Alarm actions remain empty initially—approve an operational destination separately without creating an unsolicited email subscription. Never use the SES feedback topic as the alarm destination; its consumer expects SES events, not alarm messages.

Do not connect Vercel, reopen signup, invoke weekly dispatch, create `CONTROL`, import contacts or send a test email as part of provisioning. Do not change DNS, SES identity defaults, account-wide sending or Vercel Cron.

## 7. Approval E — synthetic managed-service validation

Not performed. Approve a separate synthetic test plan and any test resources/costs first. Keep real SES sending explicitly denied and the production stack's five switches false. Do not enable production flags to make a test pass.

1. Confirm effective IAM/S3 code access and public RSS reachability from the managed runtime; test missing and denied credentials. IAM simulation can check send denial and article-prefix restrictions without reading subscriber records, but does not replace runtime testing.
2. A separately approved invalid-method API Lambda probe can confirm handler loading without secret/subscriber access: the local handler rejects GET before reading its secret. Do not invoke normal subscribe/confirm/unsubscribe/dispatch endpoints against real records.
3. Use a separate synthetic DynamoDB test namespace/table and approved test role for actual conditional/transaction behavior, concurrent confirmation, replay/expiry, suppression races, article claims/backlog and throttled/unprocessed reads. Use synthetic capability fixtures and a denied/mocked SES transport; do not fetch the production secret to build tests. The account's one-contact-list constraint means a second competing newsletter stack/list is not a valid test setup.
4. Test SNS → SQS feedback delivery, retried safety processing, contact sync and failures only with approved synthetic records/events. Creating even synthetic SES contacts or test queues is a separately approved AWS write. No SES simulator or owner-inbox mail is authorized; both are real sends.
5. Record expected outcomes, resource/record provenance and cleanup scope. Do not clear production suppression, nonce, article or recipient claims. Any destructive test-resource cleanup needs explicit scope/approval.

6. Include quota-ten load tests using synthetic records and denied/mocked SES: regional starvation, HTTP unsubscribe 429/503 and retry, SQS partial failures/DLQ retention, stream age/recovery, separate runtimes sharing the send lease, 120-second abandoned-lease recovery, conditional owner release, one-second post-send cooldown and claims held after uncertain acknowledgements. Never force-unlock the gate or erase mail claims to make tests pass. Confirmations rejected by local capacity return 503/`NOT_SENT`, remain pending, and retain the existing daily request limit; approve this enrollment tradeoff before opening signup. Verify the native Lambda Errors/Throttles alarm, stream/three-queue age alarm, DLQ alarm and SafetyFailure alarm with approved synthetic events; keep the destination unconfigured until separately approved. Use bounded log signal `Throttled` for SES/local contention and native `Throttles` for rejected Lambda invocations. Inspect native API 429/5xx during the test; no separate paid API alarm is added. Follow the minimum-cost report for diagnostic log queries and metric-math billing.

7. Resolve and validate separate SES non-send API pacing before activation. AWS documents one-request/second API limits for non-send actions; `GetContact`, suppression reads and contact synchronization are not covered by the 14/second email quota or by the SendEmail lease. Current prechecks/final checks may contend and defer/hold work. Keep safety checks and all controls false while an explicitly approved synthetic test and focused pacing review establishes reliable behavior. This is an activation gate, not a requirement to raise the account concurrency quota or upgrade its plan.

## 8. Failure, rollback and live-activation gates

Before execution, stop on a failed/unexpected change set. After approval, an unused change set may be deleted separately; no application resources need to be created to review it. During creation, allow standard CloudFormation rollback and inspect events privately. Retained queues, logs, table, SES list/configuration can remain after failure; inventory them before a retry. Do not delete them or pick a different stack name to hide a collision. No existing identity or secret should be modified to repair a failed stack.

For an already activated future system, approve sending-off controls/configuration first, preserve unsubscribe/feedback and all durable suppression/idempotency data, and use a newly reviewed rollback change set. Never roll back to old sender-enabled deployments, the eight-item planner or the truncated feed. Never rotate keys, reset the ledger or redrive uncertain deliveries to force a retry. Accepted email cannot be recalled.

Live activation remains **BLOCKED** until: account/credit continuity is approved; managed tests pass; the complete stable-GUID RSS website release and management routing are separately deployed/verified; historical unsubscribe/suppression recovery is staffed and durable; old immutable deployments/webhooks/external schedulers are contained; operator identity, consent, lawful public address, privacy/retention and incident ownership are approved; and sufficient SES quota/headroom and monitoring are verified. Zero-audience launch requires no legacy import. `CONTROL.migrationComplete` attests suppression/recovery readiness, not authorization to import subscribers.

The Free Plan can close the account at six months or credit exhaustion; retention policies do not prevent this or preserve a working unsubscribe service. Review continuity before accepting subscribers. Do not upgrade or enable paid services without a new owner decision. [Free Plan lifecycle](https://aws.amazon.com/free/free-tier-faqs/)

**Stop after each approval boundary. Packaging/provisioning approval is not registration, confirmation, newsletter delivery, website deployment or email approval.**
