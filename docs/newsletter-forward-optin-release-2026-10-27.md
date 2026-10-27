# Owner-approved forward-only newsletter release — 27 October 2026

The owner approves starting with **zero confirmed recipients**. Do not recover,
guess or reset an old audience to proceed. Signup and delivery remain paused in
the committed website until the actual AWS consent and suppression tests pass.

## Historical source and the blocker

Git revision `dea9254` contains the original `subscriber` schema and
`src/lib/newsletter/{signup,store,clients}.ts`. Earlier signup revisions used
`sanityWriteClient` and a best-effort Sanity write before sending an SES message;
that message was not double opt-in evidence. The configured namespace is Sanity
`xfs4j01p / production`. Independent `newsletterSuppression.<email-sha256>`
documents represented permanent opt-outs, including hash-only identities.

Repeated authenticated, non-CDN, raw-perspective reads using the existing working
read token found **0 subscriber, 0 newsletterSuppression, 0 newsletterCampaign and
0 newsletterDelivery documents**. The token could list the sole dataset,
`production`, and its document types. These observations do **not** establish
that subscribers never existed. No Sanity document was changed or republished.
Historical recovery remains unresolved and is not a launch prerequisite under
the owner's explicit forward-only authorization. No subscriber data or token
is included in this release. There are **0 recovered historical records to
import**; never fabricate an audience or mark old consent confirmed.

The previous launcher wrongly required its first AWS subscriber scan to be
nonempty, even though it had never imported Sanity records. It stopped before
the disabled update. This release replaces that assumption with an immutable,
owner-approved initialization receipt bound to the exact AWS account/Ledger and
fresh-consent policy.

## What initialization does

`initialize-forward-audience.py` requires the existing CONTROL registration,
confirmation and delivery gates false, disabled schedules, matching consistent
subscriber scans and zero initial fresh-policy confirmations. It preserves an
immutable, type-preserving snapshot and atomically writes `AUDIENCE-INIT#...`
plus four explicitly named forward-only approval fields on the existing
CONTROL. It does **not** rewrite subscribers, suppression, consent, old
migration evidence, `migrationComplete`, signing keys, content approvals,
publication checkpoints or send claims. Existing fresh confirmed records stop
initialization for review; they are never reset to make a zero count.

The receipt says `HISTORICAL_RECOVERY_UNRESOLVED`, not verified-empty history or
completed migration. Repeated execution verifies the same immutable receipt and
baseline fragments without reinitializing. Missing, corrupt or mismatched
evidence stops. New signup/confirmation requires either the existing genuine
migration approval or this exact forward-only policy/status/receipt approval,
as well as every existing runtime and durable consent gate. Confirmation checks
the selected approval atomically with the nonce and immutable consent audit.

Every campaign recipient must have complete fresh AWS double opt-in proof.
Legacy CONFIRMED/indexed/SES OPT_IN records are insufficient. Known Ledger,
SES account and SES contact opt-outs remain excluded, including after renewed
requests or delayed confirmation. No invitation or campaign is sent to legacy
addresses. Incomplete legacy evidence cannot itself confer eligibility.

## Execute the single release

Upload the final ZIP to AWS CloudShell and run the exact extraction/execution
command supplied with it. Use account **957261948953**, region **eu-north-1**,
existing-stack permissions and CloudShell's own execution identity. No local
AWS credentials, new connectors, replacement secrets or stack recreation are
used. Keep the extracted directory for safe resume; never delete its private
state to retry an uncertain confirmation email.

The one launcher:

1. Verifies all packaged checksums and initializes/verifies the durable audience
   receipt. Empty AWS inventory is permitted only with that verified receipt.
2. Prepares the current-source, disabled main-stack update using an immutable,
   versioned runtime object. Displays each exact change set for review; stops
   on resource additions, deletions or possible replacements. Verifies all five
   deployed function hashes. Never executes `aws-register-origin-20261026`.
3. Verifies SES identity/configuration, managed feedback and contact consumers,
   source-restricted encrypted SNS/SQS routing, preserved backlog/suppression
   continuity and monitored authenticated support opt-out. Existing v2 signing
   keys are reused; lost historical keys are neither guessed nor replaced.
4. Arms IAM-only registration and exact SES recipient restriction, submits one
   registration for the authorized test mailbox, and records intent before the
   request. The owner must observe the actual email and deliberately confirm it.
   No automatic resend, alias substitution or suppressed-address reset exists.
5. Checks the fresh atomic receipt and SES contact opt-in; performs nonmutating
   unsubscribe GET, actual CONFIRMED→SUPPRESSED POST, repeat POST and invalid
   nonce checks. The test subscriber stays permanently suppressed.
6. Publishes one explicitly synthetic complaint through SNS→SQS→feedback Lambda,
   verifies its audit and contact opt-out without changing the first unsubscribe
   reason/time, and requires the actual SES confirmation Delivery event in the
   Ledger. SES acceptance alone does not pass the test.
7. Only after those checks, reviews the public update and opens AWS registration.
   It records the secret-free `AWS-RELEASE-RECEIPT.json`.
8. Uses existing Git authentication to clone the exact reviewed `origin/master`,
   changes only the website pause switch and a public release marker, installs
   locked dependencies, runs tests/typecheck/build, commits and pushes normally.
   No subscriber storage or AWS credentials are added to Vercel. It waits for
   the exact production marker and direct AWS `/register` Subscribe link.
9. Checks existing content/cutover/publication approvals and empty work queues,
   reviews both future weekly/discovery change sets, then enables delivery only
   after deployed runtime/schedule readbacks. It never invokes a campaign or
   discovery job. The next weekly start is a future Monday; only eligible fresh
   confirmed recipients can be selected, even if that audience is empty.

Node >=22, npm and an already authenticated Git push setup must be available in
CloudShell for the website stage. Failure diagnostics are retained privately in
`.website-last-failure.log`; they must not be shared or committed. If origin
master advanced, preserve both versions and prepare from the new HEAD; never
force-push. A Vercel build/deployment failure must be resolved for the recorded
website commit before schedules are enabled. An authenticated AWS session and
actual inbox interaction are necessary; local tests cannot replace them.

## Failure and resume

The launcher serializes runs, saves state atomically, and resumes completed
steps without resending. A failed private/public canary closes enrollment;
an uncertain weekly operation closes delivery first and disables the recorded
schedules. Unsubscribe and feedback continue. No queue is purged, no subscriber
is deleted, no old consent is activated and no checkpoint/manifest is reset.

If the authorized mailbox is already suppressed, stop and retain that opt-out;
do not clear it or silently choose another address. If an operation's outcome is
uncertain, inspect its durable evidence before retrying. After complete verified
activation a rerun reports the existing release without repeating a signup.

Manual IAM-authenticated support opt-out remains available through
`cloudshell-release.py support-optout` with exact existing identity and a hash
of independently verified mailbox-ownership evidence. It never accepts a plain
public address as authority. Rollback keeps the guarded runtime and every
suppression/claim/checkpoint; use `stop-weekly --approve` for delivery/schedule
pause and `close --approve` for enrollment pause.
