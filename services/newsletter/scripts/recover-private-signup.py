"""Explicit one-time recovery of the pinned failed private release. No send API.

Absence of SUB alone is never proof. The pinned old runtime writes a permanent
request audit and immutable confirmation claim before every SES confirmation.
All attributable Ledger rows and existing SES contact/suppression block recovery.
"""
import base64, copy, decimal, hashlib, json, os, pathlib, re, time

PREVIOUS_ID = 'forward-optin-20261027-d36663bd70b4'
PREVIOUS_RUNTIME = 'a4414c220392ab4e6a4121cb57b3cacfb90261cb49bfab67318cbda9867094dc'
MAILBOX = os.environ.get('NEWSLETTER_TEST_MAILBOX', '')
IDENTIFIER = hashlib.sha256(MAILBOX.encode()).hexdigest()
GUARD = 'PRIVATE-SIGNUP-RECOVERY#' + IDENTIFIER

def require(ok, message):
    if not ok: raise RuntimeError(message)

def digest(data): return hashlib.sha256(data).hexdigest()

def canonical(row):
    def encode(value):
        if isinstance(value, decimal.Decimal): return {'$ddbDecimal': str(value)}
        raise TypeError('Unsupported private evidence type')
    return json.dumps(row, sort_keys=True, separators=(',', ':'), default=encode)

def import_checkpoint(r, directory):
    require(not r.state.get('signupAttempted') and not r.state.get('importedCheckpoint'), 'Repair checkpoint already exists; never replace it')
    old = pathlib.Path(directory).resolve()
    require(old != r.path.parent.resolve(), 'Select the original failed release directory')
    manifest = {}
    for line in (old / 'SHA256SUMS').read_text().splitlines():
        expected, name = line.split('  ', 1)
        require(pathlib.PurePosixPath(name).name == name and '\\' not in name, 'Unsafe original manifest')
        require(digest((old / name).read_bytes()) == expected, 'Original release checksum mismatch')
        manifest[name] = expected
    require({'release.json', 'newsletter-runtime.zip'} <= manifest.keys(), 'Incomplete original release')
    meta = json.loads((old / 'release.json').read_text())
    require(meta['releaseId'] == PREVIOUS_ID and meta['runtimeSha256'] == PREVIOUS_RUNTIME and manifest['newsletter-runtime.zip'] == PREVIOUS_RUNTIME,
            'Original runtime is not the reviewed claim-before-send release; recovery prohibited')
    for key in ['account', 'region', 'stack', 'origin']:
        require(meta[key] == r.meta[key], 'Original release target mismatch')
    raw = (old / '.cloudshell-release-state.json').read_bytes(); state = json.loads(raw)
    require(state.get('releaseId') == PREVIOUS_ID and state.get('signupAttempted') is True and state.get('deployedPhase') == 'test' and state.get('readiness') is True, 'Need the original attempted private-test checkpoint with verified runtime readiness')
    require(not any(state.get(k) for k in ['testPassed', 'confirmedObserved', 'unsubscribeObserved', 'feedbackMessageId', 'confirmationClaim', 'weeklyExecutionStarted', 'weeklyActivated']), 'Original checkpoint has durable test progress; recover existing enrollment instead')
    require('historicalBaseline' in state and digest(canonical(state['historicalBaseline']).encode()) == state.get('historicalBaselineSha256'), 'Original historical baseline integrity failed')
    adopted = copy.deepcopy(state)
    for key in ['prepared', 'deployedPhase', 'rollback', 'readiness']: adopted.pop(key, None)
    adopted.update(releaseId=r.meta['releaseId'], importedCheckpoint={'releaseId': PREVIOUS_ID, 'sha256': digest(raw), 'runtimeSha256': PREVIOUS_RUNTIME})
    # signupAttempted stays true forever, including across a failed recovery.
    r.state = adopted; r.save()
    print('Original uncertain attempt imported; no checkpoint reset, subscriber write or email.')

def private(r, closed):
    require(re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', MAILBOX), 'Set private NEWSLETTER_TEST_MAILBOX explicitly; no default recipient')
    r.schedules_off()
    c = r.control()
    require(c.get('deliveryEnabled') is False and c.get('registrationEnabled') is (not closed) and c.get('confirmationEnabled') is (not closed), 'Recovery enrollment gates mismatch')
    routes = {x['RouteKey']: x.get('AuthorizationType') for x in r.routes()}
    require(all(routes.get(k) == 'AWS_IAM' for k in ['GET /register', 'POST /register', 'POST /subscribe']), 'All registration routes must remain private AWS_IAM')
    fn = r.client('lambda').get_function_configuration(FunctionName=r.resources['ApiFunction'])
    require(fn['CodeSha256'] == base64.b64encode(bytes.fromhex(r.meta['runtimeSha256'])).decode(), 'Recovery runtime hash mismatch')
    require(fn.get('State') == 'Active' and fn.get('LastUpdateStatus') == 'Successful', 'API runtime not stable')
    timeout = fn.get('Timeout')
    require(type(timeout) is int and 0 < timeout <= 60, 'Unexpected API timeout; cannot establish drained request window')
    require(fn['Environment']['Variables'].get('DELIVERY_ENABLED') == 'false', 'Runtime delivery must remain disabled')
    return timeout

def secure_routes(r, approved):
    require(approved, 'Private route protection requires approval')
    r.paused(); r.schedules_off()
    routes = r.routes(); admission = ['GET /register', 'POST /register', 'POST /subscribe']
    require(all(sum(x['RouteKey'] == key for x in routes) == 1 for key in admission), 'Private route inventory mismatch')
    require(not any(x['RouteKey'] == '$default' or '{proxy' in x['RouteKey'] or x['RouteKey'].startswith('ANY ') for x in routes), 'Unexpected catch-all route')
    for route in routes:
        if route['RouteKey'] in admission:
            r.client('apigatewayv2').update_route(ApiId='lh71lvbqi8', RouteId=route['RouteId'], AuthorizationType='AWS_IAM')
    private(r, True)

def no_effects(r):
    # No projections/filters that could omit audit, suppression or provider rows.
    # Scan all pages consistently; never print any record or identity.
    args = {'ConsistentRead': True}; seen = set()
    while True:
        page = r.table.scan(**args)
        require(isinstance(page.get('Items'), list), 'Incomplete Ledger scan')
        for row in page['Items']:
            if row.get('pk') == GUARD: continue
            serialized = canonical(row).lower()
            require(IDENTIFIER not in serialized and MAILBOX not in serialized, 'Recovery blocked: attributable Ledger side effect exists (enrollment, claim, audit, suppression or rate counter). Preserve it; no resend.')
        cursor = page.get('LastEvaluatedKey')
        if not cursor: break
        marker = json.dumps(cursor, sort_keys=True)
        require(marker not in seen, 'Ledger pagination did not advance'); seen.add(marker)
        args['ExclusiveStartKey'] = cursor
    ses = r.client('sesv2')
    for method, arguments in [('get_contact', {'ContactListName': r.configuration()['CONTACT_LIST'], 'EmailAddress': MAILBOX}),
                              ('get_suppressed_destination', {'EmailAddress': MAILBOX})]:
        try: getattr(ses, method)(**arguments)
        except Exception as error:
            require(getattr(error, 'response', {}).get('Error', {}).get('Code') == 'NotFoundException', 'Recovery SES evidence read failed; no resend')
        else: raise RuntimeError('Recovery blocked: existing SES contact/suppression; preserve it, no resend')

def guarded_write(r, operation, closed):
    from boto3.dynamodb.types import TypeSerializer
    encode = TypeSerializer().serialize
    table = r.resources['Ledger']
    checks = [{'ConditionCheck': {'TableName': table, 'Key': {'pk': encode('CONTROL')},
        'ConditionExpression': 'deliveryEnabled=:no AND registrationEnabled=:gate AND confirmationEnabled=:gate',
        'ExpressionAttributeValues': {':no': encode(False), ':gate': encode(not closed)}}}]
    checks += [{'ConditionCheck': {'TableName': table, 'Key': {'pk': encode(prefix + IDENTIFIER)},
        'ConditionExpression': 'attribute_not_exists(pk)'}} for prefix in ['SUB#', 'RENEW#']]
    kind, body = next(iter(operation.items()))
    body = copy.deepcopy(body); body['TableName'] = table
    for key in ['Item', 'Key', 'ExpressionAttributeValues']:
        if key in body: body[key] = {k: encode(v) for k, v in body[key].items()}
    r.client('dynamodb').transact_write_items(TransactItems=checks + [{kind: body}])

def authorize(r, approved, approve_proof=input, wait=time.sleep):
    require(approved, 'Recovery requires explicit operator approval')
    require(r.state.get('signupAttempted') is True and r.state.get('importedCheckpoint') and not r.state.get('recoveryAuthorized') and not r.state.get('recoveryConsumed'), 'Recovery checkpoint not eligible')
    require(not r.table.get_item(Key={'pk': GUARD}, ConsistentRead=True).get('Item'), 'Durable recovery already recorded; never reset or authorize twice')
    timeout = private(r, True)
    # CONTROL was just read closed; allow every earlier invocation to finish.
    remaining = timeout + 10
    while remaining:
        step = min(5, remaining); print('Draining prior API invocations; enrollment CLOSED.'); wait(step); remaining -= step
    private(r, True); no_effects(r); private(r, True); no_effects(r)
    print('No attributable Ledger enrollment, permanent request audit, immutable confirmation claim, send receipt, rate counter, SES contact or suppression found in two complete reads.')
    require(approve_proof('Attest no Ledger/claim/audit deletion occurred; approve ONE fresh private attempt by typing APPROVE ONE RECOVERY: ').strip() == 'APPROVE ONE RECOVERY', 'Recovery not approved; no send')
    # Recheck after operator delay. Errors/partial reads stop without authorization.
    private(r, True); no_effects(r)
    proof = {'originalCheckpointSha256': r.state['importedCheckpoint']['sha256'], 'oldRuntimeSha256': PREVIOUS_RUNTIME,
        'newRuntimeSha256': r.meta['runtimeSha256'], 'releaseId': r.meta['releaseId'], 'checkedAt': int(time.time() * 1000),
        'noEffects': True, 'operatorApproved': True, 'state': 'AUTHORIZED'}
    guarded_write(r, {'Put': {'Item': {'pk': GUARD, **proof}, 'ConditionExpression': 'attribute_not_exists(pk)'}}, True)
    r.state['recoveryAuthorized'] = True; r.save()
    print('ONE recovery authorized durably; original signupAttempted remains true. No email sent by recovery.')

def consume(r):
    require(r.state.get('recoveryAuthorized') is True and not r.state.get('recoveryConsumed'), 'No unused explicit recovery authorization')
    private(r, False); no_effects(r)
    # A lost acknowledgement here holds the attempt; it never grants a retry.
    guarded_write(r, {'Update': {'Key': {'pk': GUARD}, 'UpdateExpression': 'SET #s=:used, consumedAt=:at',
        'ConditionExpression': '#s=:authorized AND releaseId=:release AND newRuntimeSha256=:runtime',
        'ExpressionAttributeNames': {'#s': 'state'}, 'ExpressionAttributeValues': {':used': 'CONSUMED', ':at': int(time.time()*1000), ':authorized': 'AUTHORIZED', ':release': r.meta['releaseId'], ':runtime': r.meta['runtimeSha256']}}}, False)
    r.state['recoveryConsumed'] = True; r.state['recoveryAuthorized'] = False; r.save()
