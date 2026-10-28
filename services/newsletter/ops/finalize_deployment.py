"""Offline receipt review; no AWS clients, launcher import or checkpoint writes.

Default is read-only. The write option is reserved for separate explicit approval
of the exact preview digest. Only a new deployment receipt can be created.
"""
import argparse
import hashlib
import json
import os
import pathlib
import re
import sys

ROOT = pathlib.Path('/home/cloudshell-user')
WORK = 'confirmation-launcher-59d8e91cf905'
PATCH = 'confirmation-post-fix-6ee620a8c933'
ORIGINAL = 'private-signup-repair-20261027-739404fe3d61'
PATCHED = '638f813fa3682caf7ccdbac556e557b65928c036836ce5221337b65bdacca150'
BASE = '89636d5a22d004e9274a0a6190a46de1904a2c7516cfa70624f62845a3f258c8'
SOURCE = '59d8e91cf905c716160d225443ee04916005ad9d3abdaecf7a0e332dc2af30bc'
FUNCTIONS = {'ApiFunction', 'PlannerFunction', 'WorkerFunction', 'FeedbackFunction', 'ContactSyncFunction'}
GATES = {'registrationEnabled', 'confirmationEnabled', 'deliveryEnabled'}
PRIVATE = {'GET /register', 'POST /register', 'POST /subscribe'}
ROUTES = PRIVATE | {m + ' ' + p for m in ('GET', 'POST') for p in
    ('/confirm', '/unsubscribe', '/api/newsletter/confirm', '/api/newsletter/unsubscribe')}
PINNED = {
    WORK + '/deploy-confirmation-fix.py': SOURCE,
    WORK + '/SHA256SUMS': 'f0ce40c8b9b8f72d5fc8881467f7a47dee1a01ec0f31d7423a70b18d9baac7e8',
    ORIGINAL + '/SHA256SUMS': 'cc6a955a895e59787039dd6bf24dea6c9c37eb7270aa477f0fa783972d77bd00',
}
WATCH = tuple(PINNED) + (WORK + '/.confirmation-fix-state.json',
    PATCH + '/.confirmation-fix-state.json', ORIGINAL + '/.cloudshell-release-state.json')


class Stop(RuntimeError):
    """Only fixed, non-sensitive guard identifiers may be surfaced."""


def guard(ok, code):
    if not ok:
        raise Stop(code)


def digest(blob):
    return hashlib.sha256(blob).hexdigest()


def encode(value):
    return (json.dumps(value, sort_keys=True, indent=2, allow_nan=False) + '\n').encode()


def decode(blob):
    def pairs(items):
        result = {}
        for key, value in items:
            guard(key not in result, 'duplicate-json-key')
            result[key] = value
        return result
    return json.loads(blob, object_pairs_hook=pairs,
        parse_constant=lambda _: (_ for _ in ()).throw(Stop('non-json-constant')))


def clean_report(value):
    """Validate saved output of the ALREADY COMPLETED read-only reconciliation.

    This validates an operator-supplied attestation, not live AWS state. Never
    promote unknown historical details or consent/claim checks into proven facts.
    """
    guard(isinstance(value, dict) and 'Error' not in value, 'evidence-error')
    guard(value['Stack']['Status'] == 'UPDATE_COMPLETE' and
        value['Stack']['StackChangeSetMatchesCheckpoint'] is True, 'stack-attribution')
    cs = value['RecordedChangeSet']
    guard('ErrorClass' not in cs and cs['ExecutionStatus'] == 'EXECUTE_COMPLETE' and
        all(cs[k] is True for k in ('StackIdentityMatches', 'IdMatchesCheckpoint',
            'StackChangeSetIdMatchesCheckpoint')), 'changeset-attribution')
    md = value['Metadata']; cp = md['WorkingCheckpoint']
    guard(cp['Exists'] is True and cp['PatchIdMatches'] is True and
        cp['OriginalDirectoryMatches'] is True and cp['executionStarted'] is True and
        cp['deployed'] == 'ABSENT_OR_WRONG_TYPE', 'checkpoint-evidence')
    guard(md['Receipt']['Exists'] is False and all(md[k] is True for k in
        ('CorrectedLauncherMatches', 'OriginalManifestMatches', 'WorkingManifestMatches')), 'artifact-evidence')
    guard(value['StackUnchangedDuringReads'] is True and value['WatchedFilesUnchanged'] is True, 'verification-consistency')
    templates = value['Templates']
    guard(all(templates[k] is True for k in ('OriginalTemplateMatchesPinnedOverlay',
        'ApiImmutableLocationMatches', 'ProcessedCodeMatchesOriginal',
        'ProcessedExceptApiCodeMatchesLocalReference', 'ApiBodyMatchesLocalReference')) and
        type(templates['ProcessedResourceCount']) is int and templates['ProcessedResourceCount'] == 50, 'templates')
    hashes = {}
    for key in ('OriginalCanonicalSha256', 'ProcessedCanonicalSha256'):
        guard(isinstance(templates[key], str) and re.fullmatch('[0-9a-f]{64}', templates[key]), 'template-hash')
        hashes[key] = templates[key]
    guard(set(value['Lambdas']) == FUNCTIONS, 'lambda-inventory')
    for name, cfg in value['Lambdas'].items():
        guard(cfg['CodeSha256Hex'] == (PATCHED if name == 'ApiFunction' else BASE) and
            cfg['Runtime'] == ('PATCHED' if name == 'ApiFunction' else 'BASE') and
            cfg['MatchesExpected'] is True and cfg['State'] == 'Active' and
            cfg['LastUpdateStatus'] == 'Successful' and cfg['UnqualifiedLatest'] is True, 'lambda-version')
    api = value['HttpApi']; routes = api['Routes']
    guard(api['ExactlyElevenExpectedRoutes'] is True and len(routes) == 11 and
        {r['Route'] for r in routes} == ROUTES, 'route-inventory')
    guard(all(all(r[k] is True for k in ('AuthorizationMatches', 'ExactUnqualifiedTargetMatches',
        'ProxyConfigurationMatches')) and r['UriForm'] in ('BARE', 'WRAPPED') for r in routes), 'route-security')
    guard(set(value['Control']) == GATES and all(v is False for v in value['Control'].values()), 'control')
    schedules = value['Schedules']
    guard(type(schedules['Count']) is int and schedules['Count'] == 2 and
        schedules['ExactlyTwoDisabled'] is True and schedules['States'] == ['DISABLED', 'DISABLED'], 'schedules')
    verified_at = value['Stack']['LastUpdatedTime']
    guard(isinstance(verified_at, str) and re.fullmatch(
        r'\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})', verified_at), 'update-time')
    return {'stackLastUpdatedTime': verified_at, 'templateCanonicalHashes': hashes}


def regular(path):
    guard(not path.is_symlink() and path.is_file(), 'missing-or-symlinked-input')
    return path.read_bytes()


def review(evidence_path, root=ROOT):
    guard(root.is_dir() and not root.is_symlink(), 'root')
    for folder in (WORK, ORIGINAL, PATCH):
        guard((root / folder).is_dir() and not (root / folder).is_symlink(), 'directory')
    raw = regular(evidence_path)
    facts = clean_report(decode(raw))
    blobs = {name: regular(root / name) for name in WATCH}
    watched = {name: digest(blob) for name, blob in blobs.items()}
    guard(all(watched[k] == v for k, v in PINNED.items()), 'artifact-changed')
    cp = decode(blobs[WORK + '/.confirmation-fix-state.json'])
    guard(cp.get('patchId') == PATCH and cp.get('originalDirectory') == str(root / ORIGINAL) and
        cp.get('executionStarted') is True and type(cp.get('deployed')) is not bool, 'working-checkpoint-changed')
    identifier = cp.get('changeSetId')
    guard(isinstance(identifier, str) and re.fullmatch(
        r'arn:aws:cloudformation:eu-north-1:957261948953:changeSet/[A-Za-z0-9_-]+/[A-Za-z0-9-]+', identifier), 'changeset-identity')
    # Approval binds this exact checkpoint to the saved Boolean-only ID-match
    # evidence. The original inspector did not persist the ID or checkpoint hash.
    receipt = {'schemaVersion': 2, 'patchId': PATCH, 'originalReleaseId': ORIGINAL,
        'deployment': 'VERIFIED', 'apiRuntimeSha256': PATCHED,
        'otherFourRuntimeSha256': BASE, 'changeSetExecution': 'EXECUTE_COMPLETE',
        'changeSetIdSha256': digest(identifier.encode()), 'evidenceSha256': digest(raw),
        'evidenceProvenance': 'Operator-approved binding of saved completed live reconciliation to these exact checkpoint bytes; no new AWS verification',
        'evidenceFacts': facts, 'watchedFileSha256': watched,
        'checkpointPolicy': 'ALL_EXISTING_CHECKPOINTS_PRESERVED; executionStarted/deployed not edited; never resume old launcher',
        'closureAtVerifiedSnapshot': {'registration': 'CLOSED', 'confirmation': 'CLOSED', 'weeklyDelivery': 'OFF', 'disabledSchedules': 2},
        'freshConsent': 'REQUIRED', 'confirmationEndToEnd': 'NOT_RUN', 'unsubscribeEndToEnd': 'NOT_RUN',
        'claimAuditRerun': False, 'historicalFailureCaller': 'UNRESOLVED_SHARED_REQUIRE_LINE_15',
        'executedChangeSetTemplateRecovered': False,
        'finalizerAwsCalls': 0, 'finalizerEmailsSent': 0, 'activationAuthorized': False}
    payload = encode(receipt)
    plan = {'action': 'CREATE_ONLY_DEPLOYMENT_RECEIPT', 'receiptSha256': digest(payload),
        'evidenceSha256': digest(raw), 'watchedFileSha256': watched,
        'checkpointWrites': 0, 'awsCalls': 0, 'receipt': receipt}
    plan_sha = digest(encode(plan))
    path = root / WORK / 'DEPLOYMENT-RECEIPT.json'
    guard(not path.is_symlink(), 'receipt-symlink')
    status = 'CREATE_AFTER_SEPARATE_APPROVAL'
    if path.exists():
        guard(regular(path) == payload, 'existing-receipt-conflict')
        status = 'IDENTICAL_RECEIPT_NO_OP'
    return {'planSha256': plan_sha, 'destinationStatus': status, **plan}, payload


def finalize(evidence_path, approved_sha, root=ROOT):
    plan, payload = review(evidence_path, root)
    guard(approved_sha == plan['planSha256'], 'approval-plan-mismatch')
    if plan['destinationStatus'] == 'IDENTICAL_RECEIPT_NO_OP':
        return 'IDENTICAL_RECEIPT_NO_OP'
    # Second full local read closes ordinary review/write drift. No AWS calls.
    repeated, again = review(evidence_path, root)
    guard(repeated['planSha256'] == approved_sha and payload == again, 'inputs-changed')
    if repeated['destinationStatus'] == 'IDENTICAL_RECEIPT_NO_OP':
        return 'IDENTICAL_RECEIPT_NO_OP'
    path = root / WORK / 'DEPLOYMENT-RECEIPT.json'
    # Exclusive creation never replaces an uncertain receipt. Interruption can
    # leave a partial file: STOP; preserve it for review, never auto-repair it.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(payload); stream.flush(); os.fsync(stream.fileno())
    guard(regular(path) == payload, 'receipt-readback')
    guard(all(digest(regular(root / name)) == expected for name, expected in
        plan['watchedFileSha256'].items()), 'watched-file-changed-after-create')
    return 'RECEIPT_CREATED_CHECKPOINTS_UNCHANGED'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--saved-evidence', type=pathlib.Path, required=True)
    parser.add_argument('--finalize-approved-plan', help='Use ONLY after separate explicit approval of this exact plan SHA256')
    args = parser.parse_args()
    try:
        if args.finalize_approved_plan:
            result = {'result': finalize(args.saved_evidence, args.finalize_approved_plan)}
        else:
            result, _ = review(args.saved_evidence)
        print(json.dumps(result, indent=2, sort_keys=True))
    except (Exception, KeyboardInterrupt) as error:
        # Do not serialize exception messages, paths, locals or checkpoint data.
        print(json.dumps({'STOP': True, 'Class': type(error).__name__,
            'Guard': str(error) if type(error) is Stop else 'local-review-failure',
            'Recovery': 'Preserve all inputs and any receipt; no launcher/AWS retry'}))
        raise SystemExit(1)


if __name__ == '__main__':
    main()
