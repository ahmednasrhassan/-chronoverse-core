# Independent newsletter consent safety

This companion stack implements the owner's two approved preflight fixes. It
does not update the newsletter stack, API code, other Lambda functions, HTTP
routes, subscribers, historical claims, signing keys, suppression records or
weekly/discovery schedules. No email or consent test is authorized by deploying
it. The website deployment hold remains in `vercel.json`.

## Source and resources

`services/newsletter/consent-safety-template.json` is the complete CloudFormation
source for stack `chronoverse-newsletter-consent-safety` in `eu-north-1`.
The deployment takes existing API role/table/SES ARNs as parameters; it never
recreates those resources. The dedicated test inbox is a private `NoEcho`
parameter, not a source constant or subscriber export.

The separate `newsletter-controlled-test-recipient` policy permits only
`ses:SendEmail`, from the existing verified sender, to exactly that one added
recipient, using the existing SES identity and configuration set. The original
`newsletter-scoped` role policy is preserved unchanged, so all previously
approved exact recipients remain allowed. No recipient wildcard is introduced.

The independent closer uses EventBridge Scheduler to start a Standard Step
Functions workflow. The workflow ignores execution input and can only set
`CONTROL.registrationEnabled` and `CONTROL.confirmationEnabled` to Boolean false.
Its update requires an existing CONTROL item; it cannot create one. The execution
role permits only `UpdateItem` on the exact ledger, leading key `CONTROL`, those
two attributes and the primary key, with no returned data. It cannot access
subscriber keys, deliveryEnabled, Secrets Manager, SES or queues.

The scheduler has a separate role that can start only this state machine and
send failures only to its dedicated encrypted queue. Role trust binds the
account and exact state machine/schedule group. The one-time closing schedule is
disabled by default; deploying the stack never opens gates or arms a live test.

Standard execution history records actual closure task completion. Three
CloudWatch alarms cover failed/timed-out/aborted executions, scheduler delivery
failures, and queued failures. The queue retains evidence for fourteen days.
Alarms are observable in AWS but have no notification actions or email
subscriptions. They do not imply unattended failure notification delivery.

## Validation and later consent window

Focused tests: `node --test services/newsletter/test/consent-safety.test.mjs`.
Live validation schedules the exact close-only workflow while all three gates
are already false, verifies a successful execution and unchanged CONTROL, then
restores the closing schedule's disabled default configuration. No email,
subscriber transition or weekly invocation is involved.

The actual one-email Subscribe / Confirm / Unsubscribe test requires separate
approval. Before opening gates, use AWS UTC time to arm the existing one-time
closer for no later than six minutes from the proposed opening, read its exact
enabled configuration back, and verify its fixed target, trust, permissions,
failure queue and alarms. Abandon an expired or uncertain arming attempt. Record
the absolute ten-minute stop time; registration and confirmation must be closed
immediately on completion or failure. Delivery stays false and both newsletter
schedules stay disabled. Do not open gates until arming has been verified.

The early closing time reserves room for [Scheduler's documented 60-second
precision](https://docs.aws.amazon.com/scheduler/latest/UserGuide/schedule-types.html),
its 60-second event age / one retry, and the workflow's 90-second
timeout (15-second task attempts with bounded retries). AWS service failures can
still delay closure: this is durable cloud-side closure independent of the local
session, not an API-enforced token/gate expiry. A strict guarantee through AWS
service outages would require an additional runtime-enforced expiry and is not
claimed by this companion stack. The deployed API is unchanged.

The existing PENDING identity, original exposed token and historical claim must
never be reused or reset. Confirm the dedicated identity is still unused and
unsuppressed immediately before the separately approved email. Keep links and
tokens private; retain only sanitized acceptance evidence.

## Exact rollback

The pre-change role policy, CONTROL configuration, API code identity and both
schedule configurations are retained in the ignored local
`.verification/consent-safety-20261028/baseline.private.json`. No original
checkpoint or immutable receipt is rewritten.

To revoke only the added recipient, update this companion stack using its
previous template and previous parameter values, changing only
`AdditionalRecipientPermissionEnabled` to `false`. Review that the change set
deletes only `AdditionalRecipientPermission`. This removes only the new inline
policy and restores the exact original effective recipient set. The original
policy must still match the saved configuration. Never overwrite it from an
older deployment template.

Before retiring the closer, verify gates false and no active test/execution,
disable and read back its schedule, then review removal of this companion stack.
The dedicated failure queue is retained. Do not remove an armed closer during a
test or use the obsolete activation continuation.

## Deployment verification

On 28 October 2026, the companion stack reached `CREATE_COMPLETE`. Its deployed
template exactly matches this source. The new policy contains one exact private
recipient and the original API policy is unchanged. Live IAM simulation allowed
the original recipient, the additional recipient and the intended CONTROL
update; it denied an unapproved recipient, a different sender, subscriber-key
updates, deliveryEnabled changes and a different table. No required simulation
context was missing.

The independently scheduled workflow actually started at `16:05:55.093 UTC` and
finished at `16:05:55.272 UTC` with `TaskSucceeded` and `ExecutionSucceeded`.
The complete CONTROL item was equal before and after this idempotent closure.
The closing schedule was then restored to disabled with its source placeholder
time. The deployed API archive hash remains
`638f813fa3682caf7ccdbac556e557b65928c036836ce5221337b65bdacca150`.
Both original newsletter schedule configurations remain unchanged and disabled.
At `16:08:35 UTC`, all three safety alarms were OK and the dedicated encrypted
failure queue was empty. Seven focused local tests passed. No email was sent,
no subscriber/claim/suppression operation ran, and no CONTROL gate was opened.

Private deployment parameters, operation identities, the original closing
schedule configuration and verification evidence are retained alongside the
baseline in `.verification/consent-safety-20261028/deployment.private.json`.
They are excluded from Git. No original checkpoint or receipt was changed.
