> Historical preparation record. The AWS confirmation patch was successfully executed and reconciled on 28 October 2026. See [the current Git synchronization review](newsletter-git-sync-2026-10-28.md) and [sanitized provenance](../services/newsletter/deployments/deployment-reviewed-2026-10-28.json). Do not run the deployment, recovery, ZIP, old-token or activation commands below. Receipt finalization and fresh-token consent testing remain separately unapproved.

# Confirmation patch deployment packaging repair

The failing package reconstructed every entry with DEFLATE level 9 and compared
the resulting ZIP SHA256 with the reviewed Windows ZIP. Fixed timestamps, file
ordering and compression level do not make different compressors emit identical
bytes. Local Python 3.14.6 uses `1.3.1.zlib-ng`; repeating the exact packaged
reconstruction with standard zlib `1.3.1-e00f703` reproduced the exact stop:
`Reconstructed runtime differs from reviewed patch`.

All **4,131 uncompressed files were identical**, but **3,032 compressed sizes**
differed. The reviewed runtime hash was
`638f813fa3682caf7ccdbac556e557b65928c036836ce5221337b65bdacca150`;
the alternate-compressor reproduction produced
`e009fe0627838b996d539adc3e799e5bf9974e047e44c4ca2248745e94443db6`.
The AWS host's exact compressor version/hash was not supplied; the reproduced
failure isolates the host-dependent recompression assumption without changing
any source file or input manifest.

The corrected package copies the exact reviewed ZIP records from the immutable
original plus a packaged `runtime.delta`. It uses six bounded byte-copy ranges,
checks the delta SHA256 and output length, retains the mandatory FULL reviewed
runtime SHA256, and verifies every file against the original or the three exact
reviewed source replacements. No ZIP writer/compressor runs during deployment.

The resulting runtime is **byte-for-byte the previously reviewed Origin/referrer
fix**, with the unchanged `638f813f…acca150` SHA256 above. No newsletter application
source was changed for this repair. AST comparison confirms that `reconstruct`
is the only changed deployment function; CloudFormation scope, previous-value
parameters, accepted-claim verification and existing-checkpoint continuation are
unchanged. Only `ApiFunction` may be modified, without replacement.

Validation:

- 10 focused deployment/reconstruction/integrity tests passed.
- The packaged script reconstructed the production-size archive with ZIP writers
  and compressors replaced by exceptions, proving they are never called.
- An independent Node Buffer assembler produced the identical complete ZIP/hash.
- Base/delta/source corruption, bad ranges, wrong full-runtime SHA, changed dependency
  content, revoked approvals and unrelated/replacing CloudFormation changes are rejected.
- All 4,131 runtime contents, manifests, exact source replacements, Python syntax
  and outer ZIP integrity were verified. The previous broad newsletter suites were
  not rerun.

Corrected ZIP:
`releases/newsletter-confirmation-assembly-fix-20261027/chronoverse-confirmation-fix.zip`

Size: **131,741 bytes**.

SHA256: `b870e7646781624129a4a68f0cc54b850ca139cb24bf5e05ba8f48deb6efb0a2`

Patch ID: `confirmation-post-fix-fd0a94a147dc`.

Use the sibling `EXECUTE.txt` command after uploading the corrected ZIP. Keep the
old failed patch directory and its files. When prompted, choose the SAME existing
`private-signup-repair-20261027-739404fe3d61` extracted private release with its hidden
checkpoint and original runtime/manifest. Do not select or create a fresh private
release. The quoted failure occurred before artifact upload/change-set preparation;
the corrected procedure still checks deployed hashes and refuses uncertain execution
replay. Keep all original subscriber/claim/checkpoint records and the accepted email.

After reviewing the exact API change set, follow the existing confirmation prompt
using the original inbox link; no reset, resend or re-enrollment occurs. Existing
unsubscribe/feedback tests resume from their saved state. Weekly delivery stays off.
No live AWS change, email send, commit or push was performed locally.
