"""Owner-approved forward-only initialization; never claims history was empty.

Run only inside the verified CloudShell release. Existing subscriber, consent,
suppression, migration, send and publication records are read, never rewritten.
No Sanity token, replacement signing key or subscriber export is packaged.
"""
import hashlib
import json

POLICY = 'aws-fresh-double-opt-in-2026-10-27-v1'
STATUS = 'HISTORICAL_RECOVERY_UNRESOLVED'
KEY = 'AUDIENCE-INIT#' + POLICY


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def wire(value):
    # Only primitive receipt fields cross this low-level DynamoDB boundary.
    if isinstance(value, bool): return {'BOOL': value}
    if isinstance(value, int): return {'N': str(value)}
    if isinstance(value, str): return {'S': value}
    if isinstance(value, dict): return {'M': {k: wire(v) for k, v in value.items()}}
    raise TypeError('Unsupported initialization receipt field')


def ready(control):
    import re
    return (control.get('migrationComplete') is True or
            (control.get('forwardOnlyReady') is True and control.get('forwardOnlyPolicy') == POLICY and
             control.get('historicalRecoveryStatus') == STATUS and
             re.fullmatch(r'[a-f0-9]{64}', control.get('forwardOnlyReceipt', '')) is not None))


def approval(control):
    if control.get('migrationComplete') is True:
        return 'migrationComplete=:yes', {}
    require(ready(control), 'Audience initialization has no valid durable approval')
    return ('forwardOnlyReady=:yes AND forwardOnlyPolicy=:forwardPolicy AND historicalRecoveryStatus=:historyStatus AND forwardOnlyReceipt=:receipt',
            {':forwardPolicy': POLICY, ':historyStatus': STATUS, ':receipt': control['forwardOnlyReceipt']})


def verify(release):
    row = release.table.get_item(Key={'pk': KEY}, ConsistentRead=True).get('Item')
    require(row and isinstance(row.get('body'), str), 'Forward-only audience receipt is missing')
    body = json.loads(row['body'])
    require(digest(row['body']) == row.get('receiptSha256'), 'Audience receipt integrity failed')
    require(body.get('policy') == POLICY and body.get('mode') == 'FORWARD_ONLY_ZERO_CONFIRMED' and
            body.get('historicalRecoveryStatus') == STATUS and body.get('historicalRecoveryComplete') is False and
            body.get('initialFreshConfirmedCount') == 0 and body.get('account') == release.meta['account'] and
            body.get('region') == release.meta['region'] and body.get('ledger') == release.resources['Ledger'],
            'Audience receipt belongs to a different policy or Ledger')
    control = release.control()
    require(control.get('forwardOnlyReady') is True and control.get('forwardOnlyPolicy') == POLICY and
            control.get('historicalRecoveryStatus') == STATUS and control.get('forwardOnlyReceipt') == row['receiptSha256'],
            'CONTROL does not reference the immutable audience receipt')
    # Read back every immutable baseline fragment; never assume an old local file
    # or a new empty directory constitutes initialization evidence.
    fragments = []
    for index, pk in enumerate(body['baselineKeys']):
        require(pk == 'AUDIENCE-BASELINE#' + body['baselineSha256'] + '#' + str(index), 'Baseline fragment ordering changed')
        saved = release.table.get_item(Key={'pk': pk}, ConsistentRead=True).get('Item', {})
        require(isinstance(saved.get('body'), str) and digest(saved['body']) == saved.get('sha256'), 'Preserved baseline evidence is missing/corrupt')
        fragments.append(saved['body'])
    require(digest(''.join(fragments)) == body['baselineSha256'], 'Preserved baseline digest changed')
    return row


def initialize(release, approved, canonical, eligible):
    require(approved, 'Forward-only initialization needs explicit owner authorization')
    release.paused()
    release.schedules_off()
    if release.table.get_item(Key={'pk': KEY}, ConsistentRead=True).get('Item'):
        return verify(release)
    control = release.control()
    require(not any(k in control for k in ['forwardOnlyReady', 'forwardOnlyReceipt', 'forwardOnlyPolicy', 'historicalRecoveryStatus']),
            'Conflicting prior forward-only state; never reset it')
    first = release.subscribers()
    require(canonical(first) == canonical(release.subscribers()), 'Subscriber inventory changed; wait for feedback and rerun safely')
    require(not any(eligible(row) for row in first.values()), 'Existing fresh confirmed AWS subscribers require review; never reset them to zero')
    # These are additive evidence records, not replacement subscriber rows.
    # Each fragment is well below DynamoDB's 400 KiB item limit.
    baseline = canonical(first)
    baseline_sha = digest(baseline)
    keys = []
    for offset in range(0, len(baseline), 40000):
        fragment = baseline[offset:offset + 40000]
        pk = 'AUDIENCE-BASELINE#' + baseline_sha + '#' + str(offset // 40000)
        item = {'pk': pk, 'body': fragment, 'sha256': digest(fragment)}
        require(len(keys) < 1000, 'Initialization baseline exceeds safe receipt size')
        previous = release.table.get_item(Key={'pk': pk}, ConsistentRead=True).get('Item')
        if previous:
            require(canonical(previous) == canonical(item), 'Immutable baseline conflict; do not overwrite it')
        else:
            release.table.put_item(Item=item, ConditionExpression='attribute_not_exists(pk)')
        keys.append(pk)
    require(canonical(first) == canonical(release.subscribers()), 'Subscriber state changed while preserving baseline; initialization stays closed')
    body = json.dumps({'version': 1, 'policy': POLICY, 'mode': 'FORWARD_ONLY_ZERO_CONFIRMED',
        'account': release.meta['account'], 'region': release.meta['region'], 'ledger': release.resources['Ledger'],
        'historicalRecoveryStatus': STATUS, 'historicalRecoveryComplete': False,
        'sanityProject': 'xfs4j01p', 'sanityDataset': 'production',
        'recoverableSanitySubscriberCount': 0, 'recoverableSanitySuppressionCount': 0,
        'sourceFinding': 'Authenticated raw reads found no recoverable records; this does not establish that historical subscribers never existed.',
        'ownerDecision': 'Start with zero confirmed recipients; preserve AWS state and require fresh AWS double opt-in.',
        'initialFreshConfirmedCount': 0, 'existingAwsSubscriberCount': len(first),
        'baselineSha256': baseline_sha, 'baselineKeys': keys}, sort_keys=True, separators=(',', ':'))
    require(len(body.encode()) < 300000, 'Initialization receipt too large')
    receipt_sha = digest(body)
    receipt = {'pk': KEY, 'body': body, 'receiptSha256': receipt_sha}
    values = {':no': False, ':yes': True, ':policy': POLICY, ':status': STATUS, ':receipt': receipt_sha}
    # Receipt and authorization commit together. migrationComplete, consent,
    # suppression, keys, publication approvals and all gates retain their values.
    release.client('dynamodb').transact_write_items(TransactItems=[
        {'Put': {'TableName': release.resources['Ledger'], 'Item': {k: wire(v) for k, v in receipt.items()}, 'ConditionExpression': 'attribute_not_exists(pk)'}},
        {'Update': {'TableName': release.resources['Ledger'], 'Key': {'pk': wire('CONTROL')},
            'UpdateExpression': 'SET forwardOnlyReady=:yes, forwardOnlyPolicy=:policy, historicalRecoveryStatus=:status, forwardOnlyReceipt=:receipt',
            'ConditionExpression': 'attribute_exists(pk) AND deliveryEnabled=:no AND registrationEnabled=:no AND confirmationEnabled=:no AND attribute_not_exists(forwardOnlyReady) AND attribute_not_exists(forwardOnlyReceipt) AND attribute_not_exists(forwardOnlyPolicy) AND attribute_not_exists(historicalRecoveryStatus)',
            'ExpressionAttributeValues': {k: wire(v) for k, v in values.items()}}}
    ])
    result = verify(release)
    require(canonical(first) == canonical(release.subscribers()), 'Unexpected subscriber mutation during initialization; enrollment stays closed')
    print('FORWARD-ONLY INITIALIZATION VERIFIED: zero initial fresh confirmations; ' + str(len(first)) + ' existing AWS subscribers preserved. Historical recovery remains UNRESOLVED; no subscriber imported or reactivated.')
    return result
