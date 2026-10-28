# Existing unsubscribe change-set continuation

Preparation only; this Git release does not execute AWS changes or unsubscribe.
Verified script SHA256: `f5e9e23a4584a348ae91b41c40de4fbc841512897f341db7582084aa3ecb32bb`.

The dedicated entry point is
`services/newsletter/scripts/resume-existing-unsubscribe.py`. Do not run the old
completion/deployment launcher to resume this operation.

## Pinned existing evidence

- Account/region: `957261948953` / `eu-north-1`.
- Stack ID: `arn:aws:cloudformation:eu-north-1:957261948953:stack/chronoverse-newsletter-v2/93e6b9d0-d087-11f1-917c-0affe37ad0f5`.
- Existing change set: `arn:aws:cloudformation:eu-north-1:957261948953:changeSet/unsubscribe-0c7a8f2124d9fd650086/f6f261fb-01bd-412f-bf85-d68c94bc3d7b`.
- Bucket: `chronoverse-nl-artifacts-957261948953-eun1`.
- Key: `newsletter-unsubscribe-fix/0c7a8f2124d9fd65008688ab57c07eaa529d3547f742e82faeee54df873680e1/runtime.zip`.
- Object version: `sgeS4R8EBiIYVysPcqLYdg7_nccfMru9`.
- Expected archive SHA256: `0c7a8f2124d9fd65008688ab57c07eaa529d3547f742e82faeee54df873680e1`.
- Live API baseline SHA256: `638f813fa3682caf7ccdbac556e557b65928c036836ce5221337b65bdacca150`.
- Other four Lambda baseline SHA256: `89636d5a22d004e9274a0a6190a46de1904a2c7516cfa70624f62845a3f258c8`.
- Reviewed `src/http.mjs` SHA256 after correction: `5cdf5812e4c161c53e072c337c0ce00b362b1a762a56d6c22bcfac97ab7fd8be`.

Compact DescribeChangeSet reported a dynamic HttpApi.Body dependency caused by
ApiFunction.Arn. The reconciled property-values response reports exactly one
effective resource modification and two Code leaf changes. This continuation
always requests IncludePropertyValues=True, follows every NextToken, rejects
repeated tokens/inconsistent pages, and requires exactly those two changes.
It compares the entire Original and Processed templates independently. It never
ignores an unexpected resource to get past a count check.

[DescribeChangeSet](https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_DescribeChangeSet.html)
does not return RoleARN. The reviewed creating script copied the existing stack
role when present; this continuation verifies that the stack role stays unchanged
before and after execution, rather than comparing a nonexistent response field.

## Tomorrow's single execution

Use the one-time CloudShell command from the release report, pinned to the full
Git commit and script SHA256. No package or extra Python module is downloaded.
The bootstrap verifies the script bytes before evaluating them in memory and
does not create a local script, archive, checkpoint or receipt.

1. In authenticated eu-north-1 CloudShell, keep terminal recording/debug logging
   off. Run the pinned command once. Type `EXECUTE_EXISTING_AND_UNSUBSCRIBE` only
   when ready. The recipient is fixed to the approved dedicated inbox; it cannot
   be supplied as an alternative CLI argument.
2. The read-only preflight downloads the exact two versioned archives into memory
   and hashes their bytes. It checks CRC integrity, member inventory, the exact
   reviewed HTTP replacement and byte identity of every other member. It does
   not reconstruct or upload either archive or rely on object hash metadata.
3. Before execution it verifies account/stack/change-set identity, the complete
   change set, parameters/capabilities/execution role/tags, both templates, all
   five Lambda configurations, all routes/integrations, private AWS_IAM routes,
   historical subscriber/claims, the dedicated CONFIRMED record, SES OPT_IN,
   strict-false CONTROL and both disabled recurring schedules. It repeats the
   relevant live guards immediately before the one execution request.
4. Only the pinned existing change set can execute. The SDK has one attempt.
   The script requires UPDATE_COMPLETE with the exact executed change-set ID,
   EXECUTE_COMPLETE, the expected API code hash, preserved API configuration,
   unchanged other functions/routes/templates and unchanged subscriber snapshots.
5. Only then may it privately obtain the existing signing key and create the
   genuine unsubscribe capability. A read-only review followed by an unchanged
   record check verifies cancel semantics; this is not native-browser acceptance.
   It submits the approved unsubscribe once, waits for SUPPRESSED, SES OPT_OUT
   and Audience exclusion, then makes the two explicitly approved idempotency
   calls. It checks stable subscriber/audit state and original subscriber/claims.
6. Success prints sanitized deployment and unsubscribe evidence. CONTROL stays
   false and both schedules stay disabled. No mail is sent and no receipt or
   checkpoint is written.

Without `--execute-existing`, the script performs read-only preview and stops
before retrieving the signing secret, creating a capability or making any write.

## STOP and recovery

Any exception, cancellation, hash/scope/state mismatch or uncertain result exits
with only the stage, exception class, fixed check identifier and change-set ID.
No exception text, capability, URL, key, record or private provider response is
printed. The script requests no retry, rollback, replacement change set or fallback
write. Existing CloudFormation failure/rollback behavior is not changed.
The code never enables or closes gates: it requires them already closed.

After STOP, do not rerun this or the old command. Preserve the sanitized result.
Reconcile only the reported boundary: exact change set/stack/Lambda after an
execution uncertainty; target subscriber/SES/audience after an unsubscribe
uncertainty. A completed deployment or suppression is not replayed. New recovery
work requires review against the authoritative resulting state. There is no
claim that this continuation fixes the historical FileNotFoundError.

The preflight does not assert full pre-test historical byte preservation where
no old private snapshot exists. It requires the established historical PENDING
state and preserves its full in-memory record and both historical/test claims
through this invocation. Public sending, signup, recurring delivery and website
changes remain outside this continuation.
