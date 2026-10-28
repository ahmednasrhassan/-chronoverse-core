# Newsletter follow-up and release decisions

**Current AWS acceptance/release status:** see
[28 October independent newsletter release](newsletter-acceptance-release-2026-10-28.md).
The older Sanity subscriber/dispatch descriptions below are historical and do
not describe the current independent AWS runtime or prepared website ingress.

Release status: **NO-GO**. This document records repository work and outstanding
owner decisions. It is not a legal policy, an effective date, or authorization
to configure production, send mail, commit, push or deploy.

## Signup pause approved on 24 October 2026

New public signup is temporarily paused in code through
`src/config/newsletterAvailability.ts`, independently of environment settings.
The newsletter landing page and reusable signup component show a notice and a
research link instead of a form; homepage/FAQ links and search/social metadata
describe the pause. No delivery or reopening date is promised.

`POST /api/newsletter` returns HTTP 503 with `status: "paused"`,
`code: "newsletter_signups_paused"`, a clear message and `Cache-Control: no-store`
before reading the request body or contacting storage. Existing active, inactive
and suppressed records cannot be changed through public signup during the pause.
The previous registration handler remains server-only in
`src/lib/newsletter/signup.ts`; its storage/validation/reactivation regressions
remain tested for a future reviewed reactivation. This is not another endpoint.
The existing form behavior is also retained behind the code-level pause.

Unsubscribe, suppression, feedback and dispatch infrastructure remain intact.
Sending still requires its existing independent confirmation gates. Account
registration, login, transactional authentication email and contact flows are
outside this pause. No production variables, AWS permissions, firewall, cron
schedule or Sanity webhook were changed. These source changes take effect only
after a separately approved deployment; the earlier warning about unverified
legacy production dispatch still applies. Any future reopening requires an
approved code change, compliance/configuration review and regression checks.

## Confirmed identity correction

The owner confirmed that Chronoverse Capital is not a US-registered LLC and that
the former Wilmington address is not an official company address. Use
**Chronoverse Capital** as the brand only. The old dispatch footer was the only
active repository claim found; it has been replaced. Repository searches cover
templates, metadata, structured data, legal/trust pages, configuration, public
assets and documentation. Negative test assertions retain the old place/entity
keywords to prevent their return. Git history, dependency files and ignored
historical verification evidence are not release content and were not rewritten.
No replacement entity, registration number, jurisdiction or postal address has
been invented. Organization JSON-LD describes the brand and makes no claim of
incorporation or a registered address.

## Implemented boundaries

- All subscriber, suppression, audience and delivery-ledger reads use explicit
  authenticated server-only clients without a CDN. New records use private dotted
  Sanity IDs. Dedicated reader/writer tokens have no general-editor fallback and
  are never public environment variables. Provider-side permissions still need
  independent verification; a variable name cannot narrow a bearer token's role.
- Signup awaits storage success, normalizes/deduplicates addresses, reactivates
  ordinarily inactive records and handles stale deterministic-ID lookups. It
  rejects suppressed records, rechecks suppression after saving, and returns
  generic errors on storage failure. Signup does not send mail.
- Encrypted authenticated unsubscribe capabilities expose neither an email nor
  a subscriber ID in plaintext. GET only presents confirmation. POST durably
  records suppression and deactivates matching copies in one transaction before
  reporting success. Public signup cannot clear suppression. A separate verified
  consent/owner process is required for any future suppression removal; no public
  removal endpoint is provided. Protect the unsubscribe secret: rotation would
  invalidate old links, so an approved rotation/continued opt-out plan is needed.
- Both dispatch entry points use the same frozen campaign/audience snapshot and
  private per-recipient ledger. Publication keys use the post ID rather than a
  retry's webhook ID; digest keys use adjacent 24-hour windows ending at 09:00 UTC.
  Exactly one of digest/publication delivery is enabled by configuration. A
  missed schedule/backfill or mode switch needs reviewed operational handling.
- Revision-conditional claims prevent concurrent duplicates. Accepted/suppressed
  recipients are never resent for that campaign. Definite SES rejections can be
  retried up to three attempts. Timeouts, missing acknowledgements and ambiguous
  outcomes remain held as `unknown`/`sending`, with no automatic retry. A lost
  persistence acknowledgement cannot trigger a resend. Manual reconciliation
  requires separate approval and provider evidence, not a blind state reset.
- Failed/held recipients keep the campaign incomplete and cause HTTP 503.
  `accepted` means SES acknowledged the request, not inbox delivery. The AWS SDK
  makes one attempt per claim. There is no exactly-once or inbox-delivery claim.
- Signed SNS feedback from one explicitly configured topic suppresses permanent
  bounces and complaints. Temporary bounces are not permanently suppressed.
  Invalid signatures/topics/certificate URLs cannot mutate storage. Certificate
  fetch and suppression-storage outages request retry with 503. Subscription
  confirmation is manual; this endpoint never fetches a supplied confirmation URL.
- Audiences over 1,000 queried records or batches over 50 articles fail for review
  before delivery rather than silently dropping recipients/content. Large-scale
  batching is outside this follow-up. Suppression is rechecked immediately before
  SES; a concurrent opt-out cannot recall mail already handed to the provider.

## Owner confirmations required before release

Every unchecked item remains unresolved. Code observations do not establish
provider configuration, commercial history or legal suitability.

| Surface | Exact decision/evidence required |
| --- | --- |
| Legal operator and brand | Identify the actual person/entity operating the brand, what identity must be disclosed, and applicable operating/audience jurisdictions. Confirm trademark/name rights. Do not describe the brand as a US legal entity or treat a founder profile as proof of operator identity. |
| Contact and public identity | Confirm `info@chronoversecapital.com` is controlled, monitored and suitable for support/privacy/copyright requests; domain, Gumroad storefront and X/Reddit/Pinterest profile ownership; Organization `sameAs`/email claims and footer copyright rights. No contact mailbox is assumed to be an approved sending identity. |
| `/about`, author profiles | Confirm Ahmed N. Hassan's founder role/LinkedIn; Ahmed Sayed Younis, Mohamed Younes and Heba Sayed Ahmed's stated analysis/review roles, names, affiliations, portraits, publication consent and any author biographies. Confirm independence and the claim that commercial arrangements do not determine conclusions. |
| Home, apps, FAQ, manifesto, terms and disclaimer | Confirm original software/IP claims, intended downloadable-tools direction, pre-launch/no-released-app status, free research/newsletter/browsing, no active software checkout/download/license system, and future eligible Gumroad distribution as an intention only. Approve no-personal-advice/non-solicitation descriptions against actual activities. No future capability, supported OS or release date is verified. |
| `/refund-policy`, terms, privacy, contact | Confirm historical sales were one-time books rather than subscriptions, completed/delivered as represented; original seller/processor/receipt terms, retained records, actual support access, refund/dispute authority and mandatory customer rights. Confirm future product eligibility and terms before listing any sale. No refund promise, warranty, support deadline or future license is authorized here. |
| `/terms-of-service` | Approve acceptance mechanism, lawful-use/account rules, IP ownership/use permissions, historical-order treatment, external services, availability/warranty/liability wording, mandatory rights and amendment process against the real operator and applicable law. Approve the displayed version date separately. |
| `/privacy-policy` | Confirm controller/operator identity, categories/purposes and lawful basis for accounts, newsletter/consent, contact and request logs; Sanity, Supabase, SES, SNS, Vercel, Google and historical payment-provider inventory, agreements/subprocessors, actual regions/international transfers, access controls, backup/log practices, rights/request verification and response process, age/audience rules where applicable. Confirm retention/deletion for accounts, subscription consent/source, campaign audience snapshots/content, delivery IDs/outcomes, encrypted opt-out links, suppression hashes/reasons, contact and historical financial records. No retention period or processing country is inferred. |
| `/cookie-policy` and privacy analytics wording | Confirm deployed consent-first Analytics behavior and host/route exclusions, actual GA IDs/settings/cookie names/lifetimes, advertising-storage denial, Supabase cookies, both localStorage consent keys and no app-set expiry. Approve separate-origin scope, reset/withdrawal adequacy, previous-cookie treatment, consent records, regional requirements, and third-party storefront boundaries. Source behavior was reviewed; no live provider configuration or jurisdictional sufficiency is assumed. |
| `/editorial-policy`, `/methodology`, `/data-sources`, `/freshness` | Approve source checking/date/reference-period practices, fact/interpretation/uncertainty separation, author responsibility for assisted tools, commercial/affiliate disclosures and independence, illustrative/documentary image rules/rights, correction handling and availability/revision claims. These standards require real operating practice and article-specific evidence. |
| `/dmca` | Confirm authorized notice handler/contact, actual notice/counter-notice, forwarding/removal/restoration process, applicable law and any designated-agent requirements. The page expressly makes no statutory-agent registration claim. |
| Policy dates and publication | Approve all displayed policy dates (including October 2026 and the existing September 2026 editorial date), substantive wording and publication timing. Dates in the current draft have not been treated as owner-approved legal effective dates. |
| Newsletter footer/content | Provide a real, authorized postal address and verified operator/sender disclosures; approve brand attribution, subject/content, subscription-consent statement and opt-out/support route. Decide applicable marketing classification, disclosures and consent rules for the intended audience. The former address cannot be reused. No newsletter may be sent while identity/address requirements remain unverified. |

For commercial mail within its scope, the [FTC CAN-SPAM guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)
calls for accurate sender information, a valid physical postal address and a
working opt-out mechanism, among other requirements. This does not establish
which laws apply to this operator or audience. The owner must resolve that scope
and the missing verified address; the code deliberately blocks sending in the
meantime. SES also requires [verified sending identities](https://docs.aws.amazon.com/ses/latest/dg/verify-addresses-and-domains.html)
in the sending region. An existing website contact address is not proof of that
verification. No verification email was requested or sent.

## Configuration and permissions: owner action, not performed

Keep sending disabled. No values below have been set in production.
The revised code fails closed, but it has not been deployed and cannot disable an
older deployment. Production dispatch/configuration has not been inspected or
changed. The owner must separately confirm that any existing live dispatch is
paused; authorizing a production pause is a separate operational decision.

| Server setting | Required before enabling |
| --- | --- |
| `SANITY_NEWSLETTER_READ_TOKEN` | Scoped read of subscriber, newsletterSuppression, newsletterCampaign and newsletterDelivery documents, including private dotted IDs in the intended dataset; no write/admin access. |
| `SANITY_NEWSLETTER_WRITE_TOKEN` | Only the read/create/update permissions necessary for those four types, query-patching subscriber opt-outs, transactions and revision-conditional claims. No deletes, unrelated content writes or project administration. Signup currently also reads existing subscriber records through this client. Verify role scoping is supported by the account/plan; do not substitute a broad editor token. |
| `NEWSLETTER_UNSUBSCRIBE_SECRET` | Strong secret of at least 32 bytes, server-only; approved stable lifetime/rotation plan and protection of old opt-out links. |
| `NEWSLETTER_SENDER_EMAIL`, `AWS_REGION` | Approved accurate sender, controlled/monitored mailbox, SES identity verified in this explicit region, scoped AWS `ses:SendRawEmail` role for that identity; DKIM/SPF/DMARC and return-path setup reviewed. Confirm headers needed for one-click unsubscribe are covered by DKIM in the eventual received message. |
| `NEWSLETTER_VERIFIED_POSTAL_ADDRESS` | Actual owner-confirmed valid postal address approved for this use. No synthetic fixture, legacy address or invented substitute. |
| `NEWSLETTER_SNS_TOPIC_ARN` | Dedicated SES feedback topic in the sending region, restricted topic publishing policy for the approved SES source/account, manually confirmed HTTPS subscription to the feedback endpoint, working permanent-bounce/complaint routing, retry/dead-letter monitoring and operational ownership. Signature v2 is preferred; v1/v2 verification is supported. |
| `NEWSLETTER_DELIVERY_MODE` | Explicitly choose `digest` or `publication`, approve the scheduler/signed webhook configuration, frozen-audience consent basis and retry/backfill process. Review duplicate risk before switching modes with pending campaigns. |
| Four confirmation gates | `NEWSLETTER_IDENTITY_CONFIRMED`, `NEWSLETTER_SENDER_CONFIRMED`, `NEWSLETTER_FEEDBACK_CONFIRMED` and finally `NEWSLETTER_SENDING_ENABLED` must all equal `true`. Confirmation flags require evidence, not merely setting variables to pass checks. |

Review legacy subscriber IDs and access rules privately under separate approval:
new dotted IDs do not retroactively secure old root-level documents. Do not make
subscribers public to solve authentication. Review existing records with missing
`active`/consent state before including them; this implementation selects only
explicitly active, unsuppressed records. No migration or production inspection
was performed.
The owner must also reconcile historical opt-outs/manual inactive records before
enabling delivery. A legacy `active: false` alone cannot distinguish an opt-out
from an ordinarily inactive signup; the preserved reactivation flow does not
constitute proof of fresh mailbox-owner consent. Any known historical opt-out
must be carried into durable suppression through a separately approved process.
Approve the signup consent/verification model and evidence needed for the actual
audience; no double-opt-in or identity verification service has been invented.

## Safe remaining verification

1. Already executed: real signup/store/crypto/unsubscribe/feedback/dispatch code
   against isolated in-memory Sanity SDK fixtures and mocked SES transport;
   synthetic `example.test` recipients, synthetic signed SNS events, no service
   credentials, denied Node networking and blocked environment-file reads.
   This verifies code integration, not the managed service's actual permission
   policy, persistence guarantees, SES configuration or email delivery.
2. After separate configuration approval, use a dedicated empty nonproduction
   Sanity project/dataset with scoped test credentials. Assert its exact project
   and dataset allowlist before connecting; never copy production subscribers or
   use a production fallback. Keep SES replaced by a throwing/capture transport
   and deny outbound AWS mail calls. Through the test app, save a synthetic
   address, read it with the dedicated reader, retry/reactivate, opt out and
   verify suppression and delivery-ledger outcomes after reconnecting. Exercise
   wrong/read-only credentials and persistence failures. This needs managed
   storage permission evidence that the offline fixture cannot supply.
3. Have the owner review SES identity/region/IAM/sandbox/quota, sender-domain
   authentication and SNS routing using configuration evidence. No email,
   subscription-confirmation request, production write or live subscriber read
   is part of the current task. Mocked signed feedback cannot establish actual
   AWS-to-endpoint routing.
4. Inbox delivery cannot be proven without a real send. Only after separate
   explicit approval and resolved identity/address requirements, use an
   owner-controlled test inbox and an isolated test audience to inspect headers,
   footer, DKIM and opt-out handling. SES simulator messages also count as real
   sends and remain prohibited. Never test a campaign against real subscribers.

Monitor permanent held outcomes, bounded-retry exhaustion, SNS retry/dead-letter
failures and missed dispatches before approving unattended operation. Do not
delete ledgers or expire claims to obtain a green completion status.

## Open Graph review

Dynamic titles/categories now truncate by Unicode code point with an ellipsis
inside the 120/40-character limit. The primary renderer is shared with the
default share card. Its response is buffered so asynchronous rendering failures
can fall back to a minimal 1200 x 630 brand card, then the existing local PNG;
only failure of every renderer/file returns 503. Fallbacks disable caching.
The last-resort logo preserves a valid image, not a guarantee of card dimensions.
There is no request-host logo fetch. Node is retained to support the local-file
fallback and the installed Next version's runtime guidance; its Edge runtime is
deprecated. The removed fallback has therefore been restored and strengthened,
without reverting completed SEO design work.

## Four Moderate audit entries: temporarily accepted residual tooling risk

The owner explicitly accepted these for this release. They represent one
[uuid advisory, GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq),
propagated through the installed dependency chain:

| Reported package | Installed dependency path |
| --- | --- |
| `sanity@6.12.0` | Direct dependency; aggregates the CLI finding |
| `@sanity/cli@8.7.0` | `sanity -> @sanity/cli` |
| `typeid-js@1.2.0` | `sanity -> @sanity/cli -> typeid-js` |
| `uuid@10.0.0` | `sanity -> @sanity/cli -> typeid-js -> uuid` |

The defect concerns UUID v3/v5/v6 with caller-provided buffers. Installed TypeID
uses UUID v7/stringify and the CLI uses it for telemetry; this is not an observed
exploitable application path. The prior production-trace review found no CLI or
TypeID chain in server traces, and it is rechecked after this build. Tooling is
still installed, so this is residual risk, not a claim that the advisory is fixed.
Immediate remediation is not a release prerequisite under the owner's explicit
acceptance and current exposure evidence. Revisit when a compatible upstream
remedy exists or the call path/runtime exposure changes. npm's proposed automated
remedy is a Sanity major downgrade to 5.14.1, which is not authorized. No dependency
versions, overrides or lockfiles were changed. Audit remains a reported failing
security check with four Moderate entries; zero High/Critical in the reviewed
report. All other release blockers remain independent of this acceptance.
