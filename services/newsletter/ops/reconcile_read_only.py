"""Targeted post-update reads only. Never imports or invokes a release launcher."""
import base64, contextlib, copy, datetime, hashlib, io, json, os, pathlib, re, sys

sys.dont_write_bytecode = True
REGION = 'eu-north-1'
ACCOUNT = '957261948953'
STACK = 'chronoverse-newsletter-v2'
API = 'lh71lvbqi8'
PATCH_ID = 'confirmation-post-fix-6ee620a8c933'
ORIGINAL_ID = 'private-signup-repair-20261027-739404fe3d61'
BASE = '89636d5a22d004e9274a0a6190a46de1904a2c7516cfa70624f62845a3f258c8'
PATCHED = '638f813fa3682caf7ccdbac556e557b65928c036836ce5221337b65bdacca150'
SOURCE = '59d8e91cf905c716160d225443ee04916005ad9d3abdaecf7a0e332dc2af30bc'
PROCESSED_REFERENCE = '12e439267fea7db1d22bfebe5083a8d39f656d0dd59de2bd52014aa4d405965f'
BODY_REFERENCE = '075eb35a6749143038d104164ea5856ed90057fb23841957b3bfd6b24cb03b13'
FUNCTIONS = ('ApiFunction', 'PlannerFunction', 'WorkerFunction', 'FeedbackFunction', 'ContactSyncFunction')
GATES = ('registrationEnabled', 'confirmationEnabled', 'deliveryEnabled')
PRIVATE = {'GET /register', 'POST /register', 'POST /subscribe'}
ROUTES = PRIVATE | {m + ' ' + p for m in ('GET', 'POST') for p in
    ('/confirm', '/unsubscribe', '/api/newsletter/confirm', '/api/newsletter/unsubscribe')}
ALLOWED = {('sts', 'get_caller_identity'), ('cloudformation', 'describe_stacks'),
    ('cloudformation', 'list_stack_resources'), ('cloudformation', 'describe_stack_events'),
    ('cloudformation', 'get_template'), ('cloudformation', 'describe_change_set'),
    ('lambda', 'get_function_configuration'), ('apigatewayv2', 'get_routes'),
    ('apigatewayv2', 'get_integrations'), ('dynamodb', 'get_item'), ('scheduler', 'list_schedules')}
SDK_ALLOWED = {(service, ''.join(word.title() for word in operation.split('_'))) for service, operation in ALLOWED}


def require(ok):
    if not ok: raise RuntimeError('ReadOnlyReconciliationGuard')


def digest(blob): return hashlib.sha256(blob).hexdigest()
def canonical(value): return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False)
def js_sha(value): return digest(canonical(value).encode())
def boolean(value): return value if type(value) is bool else 'ABSENT_OR_WRONG_TYPE'


def safe_error(error, stage):
    line = None; trace = error.__traceback__
    while trace:
        if trace.tb_frame.f_code.co_filename == __file__: line = trace.tb_lineno
        trace = trace.tb_next
    result = {'Stage': stage, 'Class': type(error).__name__, 'SourceLine': line}
    code = getattr(error, 'response', {}).get('Error', {}).get('Code')
    if code in {'ChangeSetNotFoundException', 'AccessDenied', 'AccessDeniedException', 'ValidationError', 'ResourceNotFoundException'}:
        result['AwsErrorCode'] = code
    return result


def reconcile(root=pathlib.Path('/home/cloudshell-user'), session_factory=None):
    result = {}; stage = 'startup'; active = [True]; watched = {}
    work = root / 'confirmation-launcher-59d8e91cf905'
    prior = root / PATCH_ID; original = root / ORIGINAL_ID
    state = {}; resources = {}; clients = {}; calls = []

    def audit(event, args):
        if not active[0]: return
        if event == 'open':
            mode, flags = args[1:3]
            if (isinstance(mode, str) and any(c in mode for c in 'wax+')) or (isinstance(flags, int) and flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC | os.O_APPEND)):
                raise RuntimeError('ReadOnlyReconciliationGuard')
        if event in {'os.remove', 'os.rename', 'os.rmdir', 'os.mkdir', 'os.chmod', 'os.truncate', 'os.link', 'os.symlink', 'os.utime', 'os.system', 'subprocess.Popen', 'os.posix_spawn', 'os.exec'}:
            raise RuntimeError('ReadOnlyReconciliationGuard')

    def sdk_guard(model, **kwargs):
        service = model.service_model.service_name
        require((service, model.name) in SDK_ALLOWED)

    def request_guard(model, params, **kwargs):
        sdk_guard(model)
        if model.service_model.service_name == 'dynamodb': require(params == control_args())

    def control_args():
        return {'TableName': resources['Ledger'], 'Key': {'pk': {'S': 'CONTROL'}}, 'ConsistentRead': True,
            'ProjectionExpression': '#r, #c, #d',
            'ExpressionAttributeNames': {'#r': GATES[0], '#c': GATES[1], '#d': GATES[2]}}

    def call(service, operation, **params):
        nonlocal stage
        stage = service + '.' + operation
        require((service, operation) in ALLOWED)
        if service == 'dynamodb': require(params == control_args())
        if service == 'cloudformation': require(params.get('StackName') == STACK)
        if service == 'lambda': require(params.get('FunctionName') in [resources[k] for k in FUNCTIONS])
        if service == 'apigatewayv2': require(params.get('ApiId') == API)
        if service not in clients: clients[service] = session.client(service)
        calls.append(service + '.' + operation)
        return getattr(clients[service], operation)(**params)

    def pages(service, operation, key, **params):
        seen = set()
        while True:
            response = call(service, operation, **params)
            yield from response.get(key, [])
            token = response.get('NextToken')
            if not token: break
            require(isinstance(token, str) and token not in seen); seen.add(token)
            params['NextToken'] = token

    def section(name, function):
        nonlocal stage
        stage = name
        try: result[name] = function()
        except (Exception, KeyboardInterrupt) as error: result[name] = {'Error': safe_error(error, stage)}

    def file_bytes(path):
        blob = path.read_bytes(); watched[path] = digest(blob); return blob

    def checkpoint(path, expected_patch=True):
        if not path.exists(): return {'Exists': False}, {}
        value = json.loads(file_bytes(path))
        meta = {'Exists': True, 'LastModifiedUtc': datetime.datetime.fromtimestamp(path.stat().st_mtime, datetime.timezone.utc).isoformat()}
        if expected_patch:
            meta.update(PatchIdMatches=value.get('patchId') == PATCH_ID,
                OriginalDirectoryMatches=value.get('originalDirectory') == str(original.resolve()))
            for name in ('executionStarted', 'deployed'): meta[name] = boolean(value.get(name))
            for name in ('changeSetId', 'changeSetName', 'preparingChangeSetName'):
                meta[name + 'Present'] = isinstance(value.get(name), str) and bool(value[name])
        else: meta['ReleaseIdMatches'] = value.get('releaseId') == ORIGINAL_ID
        return meta, value

    def metadata():
        nonlocal state
        current, state = checkpoint(work / '.confirmation-fix-state.json')
        old, _ = checkpoint(prior / '.confirmation-fix-state.json')
        base, _ = checkpoint(original / '.cloudshell-release-state.json', False)
        receipt_path = work / 'DEPLOYMENT-RECEIPT.json'
        receipt = {'Exists': receipt_path.exists()}
        if receipt['Exists']:
            value = json.loads(file_bytes(receipt_path))
            receipt.update(PatchIdMatches=value.get('patchId') == PATCH_ID,
                RuntimeMatches=value.get('apiRuntimeSha256') == PATCHED,
                DeploymentVerified=value.get('deployment') == 'VERIFIED',
                FreshConsentRequired=value.get('freshConsent') == 'REQUIRED')
        return {'WorkingCheckpoint': current, 'PriorPatchCheckpoint': old, 'OriginalReleaseCheckpoint': base,
            'Receipt': receipt, 'CorrectedLauncherMatches': digest(file_bytes(work / 'deploy-confirmation-fix.py')) == SOURCE,
            'OriginalManifestMatches': digest(file_bytes(original / 'SHA256SUMS')) == 'cc6a955a895e59787039dd6bf24dea6c9c37eb7270aa477f0fa783972d77bd00',
            'WorkingManifestMatches': digest(file_bytes(work / 'SHA256SUMS')) == 'f0ce40c8b9b8f72d5fc8881467f7a47dee1a01ec0f31d7423a70b18d9baac7e8'}

    def events():
        updated = stack.get('LastUpdatedTime'); require(updated is not None)
        cutoff = updated - datetime.timedelta(hours=2)
        selected = []; seen = set(); args = {'StackName': STACK}; start_seen = False; stop = False
        while True:
            response = call('cloudformation', 'describe_stack_events', **args)
            batch = response.get('StackEvents', [])
            for event in batch:
                if event['Timestamp'] < cutoff: stop = True; break
                logical = event.get('LogicalResourceId', '')
                selected.append({'Timestamp': str(event['Timestamp']),
                    'LogicalResourceId': logical if logical in resources or logical == STACK else '[unrecognized-resource]',
                    'ResourceType': event.get('ResourceType'), 'Status': event.get('ResourceStatus')})
                if logical == STACK and event.get('ResourceType') == 'AWS::CloudFormation::Stack' and event.get('ResourceStatus') == 'UPDATE_IN_PROGRESS':
                    start_seen = True; stop = True; break
            if stop or not response.get('NextToken'): break
            token = response['NextToken']; require(token not in seen); seen.add(token); args['NextToken'] = token
        return {'WindowStartUtc': str(cutoff), 'StackLastUpdatedTimeUtc': str(updated), 'Events': selected,
            'LatestUpdateStartEventSeen': start_seen,
            'StackUpdateCompleteEventSeen': any(e['ResourceType'] == 'AWS::CloudFormation::Stack' and e['Status'] == 'UPDATE_COMPLETE' for e in selected),
            'AttributionToApprovedChangeSet': 'Requires checkpoint/stack ID correlation; event success alone is not attribution'}

    def change_set():
        identifier = state.get('changeSetId')
        require(state.get('patchId') == PATCH_ID and state.get('originalDirectory') == str(original.resolve()))
        require(isinstance(identifier, str) and re.fullmatch(r'arn:aws:cloudformation:eu-north-1:957261948953:changeSet/[A-Za-z0-9_-]+/[A-Za-z0-9-]+', identifier))
        value = call('cloudformation', 'describe_change_set', StackName=STACK, ChangeSetName=identifier)
        return {'Status': value.get('Status'), 'ExecutionStatus': value.get('ExecutionStatus'),
            'StackIdentityMatches': value.get('StackId') == stack['StackId'],
            'IdMatchesCheckpoint': value.get('ChangeSetId') == identifier,
            'StackChangeSetIdMatchesCheckpoint': stack.get('ChangeSetId') == identifier if stack.get('ChangeSetId') else 'NOT_RETURNED'}

    def templates():
        bodies = {}
        for name in ('Original', 'Processed'):
            value = call('cloudformation', 'get_template', StackName=STACK, TemplateStage=name)['TemplateBody']
            bodies[name] = json.loads(value) if isinstance(value, str) else value
        manifest_raw = file_bytes(original / 'SHA256SUMS')
        require(digest(manifest_raw) == 'cc6a955a895e59787039dd6bf24dea6c9c37eb7270aa477f0fa783972d77bd00')
        manifest = manifest_raw.decode().splitlines()
        checksums = {name: sha for sha, name in (line.split('  ', 1) for line in manifest)}
        raw = file_bytes(original / 'main-template.json'); require(digest(raw) == checksums['main-template.json'])
        expected = json.loads(raw)
        package_raw = file_bytes(original / 'release.json'); require(digest(package_raw) == checksums['release.json'])
        release_meta = json.loads(package_raw)
        require(release_meta['releaseId'] == ORIGINAL_ID and release_meta['runtimeSha256'] == BASE)
        uri = bodies['Original']['Resources']['ApiFunction']['Properties']['CodeUri']
        pinned = isinstance(uri, dict) and set(uri) == {'Bucket', 'Key', 'Version'} and uri['Bucket'] == release_meta['bucket'] and uri['Key'] == 'newsletter-confirmation-fixes/' + PATCH_ID + '/' + PATCHED + '/runtime.zip' and isinstance(uri['Version'], str) and bool(uri['Version']) and uri['Version'] != 'null'
        expected['Resources']['ApiFunction']['Properties']['CodeUri'] = copy.deepcopy(uri)
        expected['Resources']['HttpApi']['Properties']['Auth'] = {'EnableIamAuthorizer': True}
        for name in ('subscribe', 'registerPage', 'registerAction'):
            event = expected['Resources']['ApiFunction']['Properties']['Events'][name]['Properties']
            require(event['Method'].upper() + ' ' + event['Path'] in PRIVATE)
            event['Auth'] = {'Authorizer': 'AWS_IAM'}
        processed = copy.deepcopy(bodies['Processed'])
        code = processed['Resources']['ApiFunction']['Properties'].pop('Code')
        code_matches = isinstance(uri, dict) and code == {'S3Bucket': uri.get('Bucket'), 'S3Key': uri.get('Key'), 'S3ObjectVersion': uri.get('Version')}
        return {'OriginalTemplateMatchesPinnedOverlay': canonical(bodies['Original']) == canonical(expected),
            'OriginalCanonicalSha256': js_sha(bodies['Original']), 'ProcessedCanonicalSha256': js_sha(bodies['Processed']),
            'ApiImmutableLocationMatches': pinned, 'ProcessedCodeMatchesOriginal': code_matches,
            'ProcessedExceptApiCodeMatchesLocalReference': js_sha(processed) == PROCESSED_REFERENCE,
            'ApiBodyMatchesLocalReference': js_sha(processed['Resources']['HttpApi']['Properties']['Body']) == BODY_REFERENCE,
            'ProcessedResourceCount': len(processed['Resources']),
            'ReferenceProvenance': 'Local 50-resource processed reference plus reviewed IAM overlay; not a recovered executed change-set template',
            'OriginallyApprovedObjectVersionIndependentlyRecovered': False}

    def lambdas():
        data = {}
        for name in FUNCTIONS:
            cfg = call('lambda', 'get_function_configuration', FunctionName=resources[name])
            actual = base64.b64decode(cfg['CodeSha256'], validate=True).hex()
            env = cfg.get('Environment', {}).get('Variables', {})
            data[name] = {'Runtime': 'PATCHED' if actual == PATCHED else 'BASE' if actual == BASE else 'UNEXPECTED',
                'CodeSha256Hex': actual,
                'MatchesExpected': actual == (PATCHED if name == 'ApiFunction' else BASE),
                'State': cfg.get('State'), 'LastUpdateStatus': cfg.get('LastUpdateStatus'),
                'UnqualifiedLatest': cfg.get('Version') == '$LATEST', 'DeliveryEnvironmentFalse': env.get('DELIVERY_ENABLED') == 'false'}
        return data

    def routes():
        integrations = {v['IntegrationId']: v for v in pages('apigatewayv2', 'get_integrations', 'Items', ApiId=API)}
        values = list(pages('apigatewayv2', 'get_routes', 'Items', ApiId=API))
        arn = 'arn:aws:lambda:' + REGION + ':' + ACCOUNT + ':function:' + resources['ApiFunction']
        wrapped = 'arn:aws:apigateway:' + REGION + ':lambda:path/2015-03-31/functions/' + arn + '/invocations'
        data = []
        for value in values:
            key = value.get('RouteKey'); target = value.get('Target', '')
            integration = integrations.get(target.removeprefix('integrations/'), {}) if target.startswith('integrations/') else {}
            uri = integration.get('IntegrationUri')
            data.append({'Route': key if key in ROUTES else '[unrecognized-route]',
                'AuthorizationMatches': value.get('AuthorizationType') == ('AWS_IAM' if key in PRIVATE else 'NONE') and not value.get('AuthorizerId') and not value.get('AuthorizationScopes'),
                'ExactUnqualifiedTargetMatches': uri in (arn, wrapped),
                'UriForm': 'BARE' if uri == arn else 'WRAPPED' if uri == wrapped else 'UNEXPECTED',
                'ProxyConfigurationMatches': integration.get('IntegrationType') == 'AWS_PROXY' and integration.get('IntegrationMethod') == 'POST' and integration.get('PayloadFormatVersion') == '2.0' and not integration.get('CredentialsArn')})
        return {'ExactlyElevenExpectedRoutes': len(values) == 11 and {v.get('RouteKey') for v in values} == ROUTES, 'Routes': data,
            'HistoricalRawSnapshotEqualityRecoverable': False}

    def control():
        item = call('dynamodb', 'get_item', **control_args()).get('Item', {})
        return {name: boolean(item.get(name, {}).get('BOOL')) for name in GATES}

    def schedules():
        values = [s for s in pages('scheduler', 'list_schedules', 'Schedules', NamePrefix='chronoverse') if 'newsletter' in s['Name'].lower() or 'discovery' in s['Name'].lower()]
        return {'Scope': 'Matching default-group schedules, as in the completed inventory', 'Count': len(values),
            'ExactlyTwoDisabled': len(values) == 2 and all(s.get('State') == 'DISABLED' for s in values),
            'States': [s.get('State') if s.get('State') in ('DISABLED', 'ENABLED') else 'UNEXPECTED' for s in values]}

    sys.addaudithook(audit)
    try:
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            section('Metadata', metadata)
            stage = 'sdk-session'
            if session_factory is None:
                import boto3
                session_factory = boto3.Session
            session = session_factory(region_name=REGION)
            session.events.register('before-parameter-build.*.*', request_guard)
            session.events.register('before-call.*.*', sdk_guard)
            require(call('sts', 'get_caller_identity').get('Account') == ACCOUNT)
            stack = call('cloudformation', 'describe_stacks', StackName=STACK)['Stacks'][0]
            result['Stack'] = {'Status': stack['StackStatus'], 'LastUpdatedTime': str(stack.get('LastUpdatedTime')),
                'StackChangeSetMatchesCheckpoint': stack.get('ChangeSetId') == state.get('changeSetId') if stack.get('ChangeSetId') else 'NOT_RETURNED'}
            resources = {r['LogicalResourceId']: r['PhysicalResourceId'] for r in pages('cloudformation', 'list_stack_resources', 'StackResourceSummaries', StackName=STACK)}
            require(resources.get('HttpApi') == API and all(name in resources for name in (*FUNCTIONS, 'Ledger')))
            for name, function in [('Events', events), ('RecordedChangeSet', change_set), ('Templates', templates), ('Lambdas', lambdas), ('HttpApi', routes), ('Control', control), ('Schedules', schedules)]: section(name, function)
            final = call('cloudformation', 'describe_stacks', StackName=STACK)['Stacks'][0]
            result['StackUnchangedDuringReads'] = final.get('StackStatus') == stack.get('StackStatus') == 'UPDATE_COMPLETE' and final.get('LastUpdatedTime') == stack.get('LastUpdatedTime')
            result['WatchedFilesUnchanged'] = all(digest(p.read_bytes()) == expected for p, expected in watched.items())
    except (Exception, KeyboardInterrupt) as error: result['Error'] = safe_error(error, stage)
    finally: active[0] = False
    result['ApiCalls'] = calls
    result['AutomaticFinalization'] = 'NEVER; no checkpoint or receipt write is implemented'
    return result


if __name__ == '__main__': print(json.dumps(reconcile(), indent=2, sort_keys=True))
