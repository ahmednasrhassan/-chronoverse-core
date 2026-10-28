"""Operator-run API-only confirmation patch. No registration request, email send or Git operation."""
import argparse, base64, contextlib, copy, hashlib, importlib.util, io, json, os, pathlib, re, uuid, zipfile

HERE = pathlib.Path(__file__).resolve().parent
MODULES = {'src/http.mjs', 'src/service.mjs', 'src/aws.mjs'}
PRIVATE_ROUTES = {'GET /register', 'POST /register', 'POST /subscribe'}
ROUTES = PRIVATE_ROUTES | {method + ' ' + path for method in ['GET', 'POST'] for path in
    ['/confirm', '/unsubscribe', '/api/newsletter/confirm', '/api/newsletter/unsubscribe']}
INTEGRATION = {'httpMethod': 'POST', 'type': 'aws_proxy', 'payloadFormatVersion': '2.0',
    'uri': {'Fn::Sub': 'arn:${AWS::Partition}:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${ApiFunction.Arn}/invocations'}}
IAM_SCHEME = {'type': 'apiKey', 'name': 'Authorization', 'in': 'header', 'x-amazon-apigateway-authtype': 'awsSigv4'}


def require(ok, message):
    if not ok: raise RuntimeError(message)


def sha(data): return hashlib.sha256(data).hexdigest()
def read(path): return json.loads(path.read_text())


def failure_details(error, stage='startup'):
    # Never serialize exception text, paths, locals, SDK responses or causes.
    if '_confirmation_failure' in error.__dict__: return error._confirmation_failure
    source, line = 'launcher', None
    trace = error.__traceback__
    while trace:
        code = trace.tb_frame.f_code
        if code.co_filename == __file__ and code.co_name != 'failure_stage':
            source, line = 'launcher', trace.tb_lineno
        elif pathlib.Path(code.co_filename).name == 'cloudshell-release.py':
            source, line = 'original-helper', trace.tb_lineno
        trace = trace.tb_next
    return {'Stage': stage, 'Class': type(error).__name__, 'Source': source, 'SourceLine': line}


@contextlib.contextmanager
def failure_stage(name):
    try: yield
    except (Exception, KeyboardInterrupt) as error:
        # Keep the innermost stage even when callers rethrow the same error.
        error._confirmation_failure = failure_details(error, name)
        raise


def canonical_json(value):
    # Object order and dict/OrderedDict representation are not JSON content.
    # Preserve every key/value, array order, scalar type and intrinsic expression.
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False)


def same_json(left, right): return canonical_json(left) == canonical_json(right)


@failure_stage('runtime-assembly')
def reconstruct(directory, meta):
    blob = (directory / 'newsletter-runtime.zip').read_bytes()
    require(sha(blob) == meta['baseRuntimeSha256'], 'Original runtime differs; preserve it and stop')
    require(set(meta['patches']) == MODULES, 'Patch scope must be the three reviewed confirmation modules')
    assembly = meta.get('runtimeAssembly', {})
    require(assembly.get('format') == 'zip-record-copy-v1', 'Need the reviewed byte-copy delta; never recompress in CloudShell')
    delta = (HERE / 'runtime.delta').read_bytes()
    require(len(delta) == assembly.get('deltaBytes') and sha(delta) == assembly.get('deltaSha256'), 'Runtime delta checksum mismatch')
    parts = assembly.get('parts')
    require(isinstance(parts, list) and 0 < len(parts) <= 16384, 'Invalid runtime assembly plan')
    require(type(assembly.get('runtimeBytes')) is int and 0 < assembly['runtimeBytes'] < 50 * 1024**2, 'Invalid reconstructed runtime size')
    chunks = []; size = 0
    for part in parts:
        require(isinstance(part, dict) and set(part) == {'source', 'offset', 'length'} and part['source'] in ['base', 'delta'], 'Invalid runtime assembly part')
        source = blob if part['source'] == 'base' else delta
        offset, length = part['offset'], part['length']
        require(type(offset) is int and type(length) is int and offset >= 0 and length > 0 and offset + length <= len(source), 'Runtime assembly range out of bounds')
        size += length
        require(size <= assembly['runtimeBytes'], 'Runtime assembly exceeds reviewed size')
        chunks.append(source[offset:offset+length])
    require(size == assembly['runtimeBytes'], 'Runtime assembly size mismatch')
    result = b''.join(chunks)
    require(sha(result) == meta['runtimeSha256'], 'Reconstructed runtime differs from reviewed patch')
    # Compression bytes are copied, never regenerated. Verify content as well as
    # the exact reviewed archive: only these three already-tested modules differ.
    with zipfile.ZipFile(io.BytesIO(blob)) as original, zipfile.ZipFile(io.BytesIO(result)) as patched:
        require(original.namelist() == patched.namelist() and len(original.namelist()) == len(set(original.namelist())), 'Runtime ZIP inventory mismatch')
        for name in original.namelist():
            before = original.read(name)
            if name in MODULES:
                require(sha(before) == meta['patches'][name]['before'], 'Original module checksum mismatch')
                expected = (HERE / name).read_bytes()
                require(sha(expected) == meta['patches'][name]['after'], 'Patch module checksum mismatch')
            else: expected = before
            require(patched.read(name) == expected, 'Runtime content exceeds reviewed confirmation patch scope')
    return result


@failure_stage('original-release')
def original_release(directory, meta):
    require(sha((directory / 'SHA256SUMS').read_bytes()) == meta['originalManifestSha256'], 'Use the exact existing extracted release directory; its checkpoint must not be replaced')
    for line in (directory / 'SHA256SUMS').read_text().splitlines():
        expected, name = line.split('  ', 1)
        require(pathlib.PurePosixPath(name).name == name and '\\' not in name and sha((directory / name).read_bytes()) == expected, 'Original release checksum mismatch')
    original_meta = read(directory / 'release.json')
    require(original_meta['releaseId'] == meta['originalReleaseId'] and original_meta['runtimeSha256'] == meta['baseRuntimeSha256'], 'Wrong original release')
    spec = importlib.util.spec_from_file_location('original_verified_release', directory / 'cloudshell-release.py')
    helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
    r = helper.Release()
    require(r.state.get('signupAttempted') is True and r.state.get('signupHttpStatus') == 202 and r.state.get('confirmationClaim'), 'Need the successful existing signup checkpoint; never create a new one')
    require(r.state.get('deployedPhase') == 'test' and r.state.get('readiness') is True and not r.state.get('weeklyExecutionStarted'), 'Original release is not the reviewed private test')
    verify_claim(helper, r)
    return helper, r


@failure_stage('existing-claim')
def verify_claim(helper, r):
    identifier = helper.sha(helper.TEST_MAILBOX.encode())
    prefix = 'MAIL#confirmation#' + identifier + '#'
    key = r.state['confirmationClaim']
    require(isinstance(key, str) and key.startswith(prefix) and re.fullmatch(r'[A-Za-z0-9_-]{32}', key[len(prefix):]), 'Existing claim identity mismatch')
    claim = r.table.get_item(Key={'pk': key}, ConsistentRead=True).get('Item', {})
    require(claim.get('state') == 'ACCEPTED' and claim.get('messageId'), 'Existing confirmation acceptance must remain intact; do not resend')
    row = r.subscriber()
    require(row and row.get('id') == identifier and row.get('email') == helper.TEST_MAILBOX, 'Existing authorized subscriber missing; do not recreate it')
    if row.get('state') == 'PENDING': require(key == prefix + row.get('confirmationNonce', ''), 'Existing claim/nonce mismatch')
    if r.state.get('providerMessageId'): require(r.state['providerMessageId'] == claim['messageId'], 'Existing provider receipt mismatch')
    return row


def verify_closed(r):
    with failure_stage('closure.control'):
        control = r.control()
        require(isinstance(control, dict) and all(control.get(k) is False for k in
            ['registrationEnabled', 'confirmationEnabled', 'deliveryEnabled']),
            'Existing CONTROL must explicitly keep registration, confirmation and delivery false; stop without writing')
    with failure_stage('closure.schedules'):
        r.schedules_off()
    return control


@failure_stage('isolation')
def verify_isolation(r):
    # Execute the pinned original method, including every baseline, suppression
    # and consent-audit check. Only its persistence target changes to memory.
    checkpoint = r.path.read_bytes()
    state = copy.deepcopy(r.state)
    verification = copy.copy(r)
    verification.state = copy.deepcopy(state)
    expected = copy.deepcopy(state); expected['isolationVerified'] = True
    receipts = []
    def save_receipt():
        require(same_json(verification.state, expected), 'Unexpected isolation checkpoint change')
        receipts.append(True)
    verification.save = save_receipt
    try:
        verification.isolation()
        require(receipts == [True] and same_json(verification.state, expected), 'Original isolation verification did not complete exactly once')
    finally:
        require(same_json(r.state, state) and r.path.read_bytes() == checkpoint, 'Original isolation checkpoint changed; stop')


@failure_stage('private-configuration')
def verify_private(r, meta, api_expected):
    control = verify_closed(r)
    require(control.get('legacyRetired') is True and control.get('complianceApproved') is True, 'Existing durable approvals were revoked; this patch must not restore them')
    routes = {x['RouteKey']: x.get('AuthorizationType') for x in r.routes()}
    require(all(routes.get(k) == 'AWS_IAM' for k in ['GET /register', 'POST /register', 'POST /subscribe']), 'Registration must remain protected by AWS_IAM')
    require(all(routes.get(k, 'NONE') == 'NONE' and k in routes for k in ['GET /confirm', 'POST /confirm']), 'Confirmation routes must remain browser-accessible')
    require(not any(k == '$default' or k.startswith('ANY ') or '{proxy' in k for k in routes), 'Unreviewed catch-all route')
    expected = base64.b64encode(bytes.fromhex(meta['baseRuntimeSha256'])).decode()
    api_config = None
    for logical in ['ApiFunction', 'PlannerFunction', 'WorkerFunction', 'FeedbackFunction', 'ContactSyncFunction']:
        cfg = r.client('lambda').get_function_configuration(FunctionName=r.resources[logical])
        require(cfg['State'] == 'Active' and cfg['LastUpdateStatus'] == 'Successful', 'Wait for a stable Lambda update; do not replay an uncertain deployment')
        wanted = base64.b64encode(bytes.fromhex(api_expected)).decode() if logical == 'ApiFunction' else expected
        require(cfg['CodeSha256'] == wanted and cfg['Environment']['Variables']['DELIVERY_ENABLED'] == 'false', 'Unexpected deployed runtime or delivery gate')
        if logical == 'ApiFunction': api_config = cfg
    env = api_config['Environment']['Variables']
    require(all(env.get(k) == 'true' for k in ['REGISTRATION_ENABLED', 'CONFIRMATION_ENABLED', 'LEGACY_DISPATCH_RETIRED', 'COMPLIANCE_APPROVED']) and env['PUBLIC_ORIGIN'] == r.meta['origin'], 'Original private confirmation configuration mismatch')
    # The private routes and exact SES recipient restriction survive the patch unchanged.
    iam = r.client('iam'); role = api_config['Role'].split('/')[-1]
    require(not iam.list_attached_role_policies(RoleName=role)['AttachedPolicies'], 'Unexpected API managed policy')
    grants = 0
    for name in iam.list_role_policies(RoleName=role)['PolicyNames']:
        for statement in iam.get_role_policy(RoleName=role, PolicyName=name)['PolicyDocument']['Statement']:
            if statement.get('Effect') != 'Allow': continue
            actions = statement.get('Action', []); actions = [actions] if isinstance(actions, str) else actions
            require('NotAction' not in statement, 'Unreviewed API NotAction grant')
            for action in actions:
                import fnmatch
                if not any(fnmatch.fnmatchcase(x, action.lower()) for x in ['ses:sendemail', 'ses:sendrawemail']): continue
                require(action.lower() == 'ses:sendemail' and statement.get('Condition', {}).get('ForAllValues:StringEquals', {}).get('ses:Recipients') == [meta['testRecipient']], 'Exact private test recipient restriction missing')
                grants += 1
    require(grants == 1, 'Expected one private API send grant')
    verify_isolation(r)
    verify_closed(r)


@failure_stage('change-set-scope')
def inspect_changes(result, resources, *, dependency_only=False):
    require(not result.get('NextToken'), 'Change-set pages were not completely collected')
    require(not result.get('ParentChangeSetId') and not result.get('IncludeNestedStacks'), 'Unreviewed nested change set')
    require(result.get('Status') == 'CREATE_COMPLETE' and result.get('ExecutionStatus') == 'AVAILABLE', 'Need a complete, unexecuted change set; never replay execution')
    changes = result.get('Changes', [])
    require(len(changes) == 2 and {x.get('ResourceChange', {}).get('LogicalResourceId') for x in changes} == {'ApiFunction', 'HttpApi'}, 'NEW change set exceeds reviewed ApiFunction.Code / HttpApi.Body resource scope; see safe diagnostics')
    for entry in changes:
        change = entry['ResourceChange']; logical = change['LogicalResourceId']
        resource_type, prop = ('AWS::Lambda::Function', 'Code') if logical == 'ApiFunction' else ('AWS::ApiGatewayV2::Api', 'Body')
        require(entry.get('Type') == 'Resource' and change.get('ResourceType') == resource_type and
            change.get('PhysicalResourceId') == resources[logical] and change.get('Action') == 'Modify' and
            change.get('Replacement') == 'False' and change.get('Scope') == ['Properties'] and
            not change.get('ModuleInfo'), 'Unreviewed resource identity, replacement or scope')
        details = change.get('Details', []); require(details, 'Missing property-level change details')
        for detail in details:
            target = detail.get('Target', {})
            require(target.get('Attribute') == 'Properties' and target.get('Name') == prop and
                target.get('RequiresRecreation') == 'Never', 'Unreviewed property modification or recreation')
            path = target.get('Path')
            require(not path or path == '/Properties/' + prop or path.startswith('/Properties/' + prop + '/'), 'Unexpected property path')
            source = (detail.get('ChangeSource'), detail.get('Evaluation'), detail.get('CausingEntity'))
            allowed = {('DirectModification', 'Static', None)} if logical == 'ApiFunction' else {('ResourceAttribute', 'Dynamic', 'ApiFunction.Arn')}
            if logical == 'HttpApi' and not dependency_only: allowed.add(('DirectModification', 'Static', None))
            require(source in allowed, 'Unreviewed property change source or dependency')


def api_body(body, private):
    require(isinstance(body, dict) and body.get('openapi') == '3.0.1' and not body.get('security'), 'Unexpected API definition/default authorization')
    operations = {method.upper() + ' ' + path: op for path, methods in body.get('paths', {}).items() for method, op in methods.items()}
    require(set(operations) == ROUTES, 'Unexpected API paths or methods')
    for route, op in operations.items():
        expected = {'x-amazon-apigateway-integration': INTEGRATION, 'responses': {}}
        if private and route in PRIVATE_ROUTES: expected['security'] = [{'AWS_IAM': []}]
        require(same_json(op, expected), 'Unreviewed API integration, authorization or operation')
    require(same_json(body.get('components', {}), {'securitySchemes': {'AWS_IAM': IAM_SCHEME}} if private else {}), 'Unreviewed API security definitions')


def private_body(body):
    api_body(body, False)
    result = copy.deepcopy(body)
    result['components'] = {'securitySchemes': {'AWS_IAM': IAM_SCHEME}}
    for route in PRIVATE_ROUTES:
        method, path = route.split(' ')
        result['paths'][path][method.lower()]['security'] = [{'AWS_IAM': []}]
    api_body(result, True)
    return result


@failure_stage('processed-template')
def inspect_templates(before, after, code, *, dependency_only=False):
    # Compare the ENTIRE processed templates, not just named changed resources.
    # This also pins environment, roles, permissions, keys, data, schedules and stage.
    expected = copy.deepcopy(before)
    require(set(code) == {'Bucket', 'Key', 'Version'} and all(isinstance(x, str) and x for x in code.values()), 'Unpinned runtime location')
    expected['Resources']['ApiFunction']['Properties']['Code'] = {'S3Bucket': code['Bucket'], 'S3Key': code['Key'], 'S3ObjectVersion': code['Version']}
    body = expected['Resources']['HttpApi']['Properties']['Body']
    api_body(body, False)
    if not dependency_only: expected['Resources']['HttpApi']['Properties']['Body'] = private_body(body)
    require(same_json(after, expected), 'Processed template exceeds reviewed Code/Body changes; no execution permitted')


@failure_stage('template-read')
def get_template(r, stage, change_set=None):
    args = {'StackName': r.meta['stack'], 'TemplateStage': stage}
    if change_set: args['ChangeSetName'] = change_set
    body = r.cf.get_template(**args)['TemplateBody']
    return json.loads(body) if isinstance(body, str) else body


def safe_id(value, pattern=r'[A-Za-z0-9][A-Za-z0-9:/_.-]{0,1599}'):
    return value if isinstance(value, str) and re.fullmatch(pattern, value) else '[redacted]'


def change_diagnostics(result):
    # Explicit allowlist: no values, Context, parameters, descriptions, paths,
    # SDK exceptions, request IDs or pagination tokens ever enter this output.
    changes = []
    def enum(value, allowed): return value if value in allowed else '[unrecognized]'
    for entry in result.get('Changes', []):
        change = entry.get('ResourceChange', {}); details = []
        for detail in change.get('Details', []):
            target = detail.get('Target', {}); source = detail.get('ChangeSource')
            cause = detail.get('CausingEntity')
            details.append({'Target': {
                'Attribute': enum(target.get('Attribute'), ['Properties', 'Metadata', 'CreationPolicy', 'UpdatePolicy', 'DeletionPolicy', 'UpdateReplacePolicy', 'Tags']),
                'Name': safe_id(target.get('Name'), r'[A-Za-z][A-Za-z0-9]{0,254}'),
                'RequiresRecreation': enum(target.get('RequiresRecreation'), ['Never', 'Conditionally', 'Always'])},
                'Evaluation': enum(detail.get('Evaluation'), ['Static', 'Dynamic']),
                'ChangeSource': enum(source, ['ResourceReference', 'ParameterReference', 'ResourceAttribute', 'DirectModification', 'Automatic', 'NoModification']),
                'CausingEntity': safe_id(cause, r'[A-Za-z][A-Za-z0-9]{0,254}(?:\.[A-Za-z][A-Za-z0-9]{0,254})?')
                    if cause and source in ['ResourceReference', 'ResourceAttribute', 'ParameterReference'] else None})
        changes.append({'LogicalResourceId': safe_id(change.get('LogicalResourceId'), r'[A-Za-z][A-Za-z0-9]{0,254}'),
            'PhysicalResourceId': safe_id(change.get('PhysicalResourceId')),
            'Action': enum(change.get('Action'), ['Add', 'Modify', 'Remove', 'Import', 'Dynamic', 'SyncWithActual']),
            'Replacement': enum(change.get('Replacement'), ['False', 'True', 'Conditional']), 'Details': details})
    print(json.dumps({'ChangeSetId': safe_id(result.get('ChangeSetId')), 'Changes': changes}, indent=2), flush=True)


def change_set_pages(r, operation, **args):
    token = None; seen = set()
    while True:
        page = getattr(r.cf, operation)(StackName=r.meta['stack'], **args, **({'NextToken': token} if token else {}))
        yield page
        token = page.get('NextToken')
        if not token: return
        require(isinstance(token, str) and len(token) <= 1024 and token not in seen, 'Invalid or repeated CloudFormation pagination token; stop')
        seen.add(token)


def describe(r, change_set):
    result = None; changes = []
    identity = ['StackId', 'ChangeSetId', 'Status', 'ExecutionStatus', 'ParentChangeSetId', 'IncludeNestedStacks']
    for page in change_set_pages(r, 'describe_change_set', ChangeSetName=change_set, IncludePropertyValues=True):
        # Flush each received page BEFORE checking it or verifying gates on failure.
        change_diagnostics(page)
        require(page.get('StackId') == r.stack['StackId'], 'Unexpected change-set stack')
        if result is None: result = dict(page)
        else: require(all(page.get(k) == result.get(k) for k in identity), 'Change-set identity or status changed between pages; stop')
        changes.extend(page.get('Changes', []))
    result.pop('NextToken', None); result['Changes'] = changes
    return result


def historical_sets(r, state, save):
    # Inventory is read-only. Historical sets are NEVER execution targets and
    # their count, status or template must not gate a newly reviewed deployment.
    summaries = [x for page in change_set_pages(r, 'list_change_sets') for x in page.get('Summaries', [])]
    retained = set(state.get('historicalChangeSetIds', []))
    print('Historical change sets: read-only evidence, retained; never approved or executed here.', flush=True)
    for summary in summaries:
        if not summary.get('ChangeSetName', '').startswith('confirmation-post-fix-'): continue
        require(summary.get('StackId') == r.stack['StackId'], 'Unexpected historical change-set stack')
        identifier = summary['ChangeSetId']; retained.add(identifier)
        try: describe(r, identifier)
        except Exception:
            # A historical set can disappear/become unavailable concurrently.
            # No historical read can grant execution; the NEW set still has all
            # identity, scope, property, template and security checks below.
            print(json.dumps({'ChangeSetId': safe_id(identifier)}), flush=True)
            print('Historical inspection unavailable; retained without execution. New-set checks remain mandatory.', flush=True)
    state['historicalChangeSetIds'] = sorted(retained); save()


@failure_stage('live-routes')
def route_configuration(r):
    client = r.client('apigatewayv2'); api_id = r.resources['HttpApi']
    integrations = {x['IntegrationId']: x for page in client.get_paginator('get_integrations').paginate(ApiId=api_id) for x in page.get('Items', [])}
    routes = r.routes(); require(len(routes) == len(ROUTES) and {x['RouteKey'] for x in routes} == ROUTES, 'Live route inventory differs')
    arn = 'arn:aws:lambda:' + r.meta['region'] + ':' + r.meta['account'] + ':function:' + r.resources['ApiFunction']
    result = {}
    for route in routes:
        key = route['RouteKey']; target = route.get('Target', '')
        require(route.get('AuthorizationType') == ('AWS_IAM' if key in PRIVATE_ROUTES else 'NONE') and not route.get('AuthorizerId') and not route.get('AuthorizationScopes'), 'Live route authorization differs')
        require(target.startswith('integrations/') and target[len('integrations/'):] in integrations, 'Missing live Lambda integration')
        integration = integrations[target[len('integrations/'):]]
        require(integration.get('IntegrationType') == 'AWS_PROXY' and integration.get('IntegrationMethod') == 'POST' and
            integration.get('PayloadFormatVersion') == '2.0' and not integration.get('CredentialsArn') and
            integration.get('IntegrationUri') in [arn, 'arn:aws:apigateway:' + r.meta['region'] + ':lambda:path/2015-03-31/functions/' + arn + '/invocations'], 'Unexpected live integration')
        result[key] = {'route': {k: v for k, v in route.items() if k not in ['RouteId', 'Target']},
            'integration': {k: v for k, v in integration.items() if k != 'IntegrationId'}}
    return result


def template_for_patch(original, bucket, key, version):
    template = copy.deepcopy(original)
    template['Resources']['ApiFunction']['Properties']['CodeUri'] = {'Bucket': bucket, 'Key': key, 'Version': version}
    # The existing private release applied these IAM settings directly to routes.
    # Declare the SAME settings so an API Body reimport cannot remove protection.
    require('Auth' not in template['Resources']['HttpApi']['Properties'], 'Unexpected source API authorization')
    template['Resources']['HttpApi']['Properties']['Auth'] = {'EnableIamAuthorizer': True}
    events = template['Resources']['ApiFunction']['Properties']['Events']
    for name in ['subscribe', 'registerPage', 'registerAction']:
        props = events[name]['Properties']
        require(props['Method'].upper() + ' ' + props['Path'] in PRIVATE_ROUTES and 'Auth' not in props, 'Unexpected private event')
        props['Auth'] = {'Authorizer': 'AWS_IAM'}
    return template


@failure_stage('deployment')
def deploy(r, directory, meta, state, save, approve=input):
    new_hash = base64.b64encode(bytes.fromhex(meta['runtimeSha256'])).decode()
    current = r.client('lambda').get_function_configuration(FunctionName=r.resources['ApiFunction'])['CodeSha256']
    if current == new_hash:
        verify_private(r, meta, meta['runtimeSha256']); route_configuration(r)
        api_body(get_template(r, 'Processed')['Resources']['HttpApi']['Properties']['Body'], True)
        state['deployed'] = True; save(); return
    require(not state.get('executionStarted'), 'Prior change-set execution is uncertain; inspect its saved ID instead of replaying it')
    r.paused(); verify_private(r, meta, meta['baseRuntimeSha256'])
    blob = reconstruct(directory, meta)
    old_template = get_template(r, 'Original')
    require(same_json(old_template, read(directory / 'main-template.json')), 'Live source template differs from the pinned private release; do not overwrite it')
    processed = get_template(r, 'Processed')
    api_before = route_configuration(r)
    historical_sets(r, state, save)
    require(approve('Prepare an API-only CloudFormation patch; no email or subscriber write. Type PREPARE CONFIRMATION FIX: ').strip() == 'PREPARE CONFIRMATION FIX', 'Patch preparation not approved')
    key = 'newsletter-confirmation-fixes/' + meta['patchId'] + '/' + meta['runtimeSha256'] + '/runtime.zip'
    s3 = r.client('s3'); bucket = r.meta['bucket']
    require(s3.get_bucket_versioning(Bucket=bucket).get('Status') == 'Enabled', 'Artifact bucket versioning must remain enabled')
    try:
        uploaded = s3.put_object(Bucket=bucket, Key=key, Body=blob, IfNoneMatch='*', ServerSideEncryption='AES256', ContentType='application/zip')
        version = uploaded.get('VersionId')
    except Exception as error:
        require(getattr(error, 'response', {}).get('Error', {}).get('Code') in ['PreconditionFailed', '412'], 'Artifact upload failed; inspect privately')
        existing = s3.get_object(Bucket=bucket, Key=key)
        require(sha(existing['Body'].read()) == meta['runtimeSha256'], 'Immutable artifact conflict; never overwrite')
        version = existing.get('VersionId')
    require(version and version != 'null', 'Need immutable runtime VersionId')
    template = template_for_patch(old_template, bucket, key, version)
    body = json.dumps(template, separators=(',', ':')); require(len(body.encode()) <= 51200, 'TemplateBody too large')
    name = meta['patchId'] + '-' + uuid.uuid4().hex[:8]
    state['preparingChangeSetName'] = name; save()
    print(json.dumps({'ChangeSetId': name}), flush=True)
    created = r.cf.create_change_set(StackName=r.meta['stack'], ChangeSetName=name, ChangeSetType='UPDATE', TemplateBody=body,
        Parameters=[{'ParameterKey': p['ParameterKey'], 'UsePreviousValue': True} for p in r.stack['Parameters']],
        Capabilities=['CAPABILITY_IAM', 'CAPABILITY_AUTO_EXPAND'], Description='Confirmation API code fix; preserve existing private IAM routes in SAM; no enrollment, email or schedule change')
    state.update(changeSetId=created['Id'], changeSetName=name); save()
    print(json.dumps({'ChangeSetId': safe_id(created['Id'])}), flush=True)
    try:
        with failure_stage('change-set-wait'):
            r.cf.get_waiter('change_set_create_complete').wait(StackName=r.meta['stack'], ChangeSetName=created['Id'])
    except Exception as error:
        failure = failure_details(error)
        try: describe(r, created['Id'])
        except Exception: pass
        stopped = RuntimeError('NEW change set did not complete creation; retained for inspection, never executed')
        stopped._confirmation_failure = failure
        raise stopped from None
    changes = describe(r, created['Id']); inspect_changes(changes, r.resources)
    code = template['Resources']['ApiFunction']['Properties']['CodeUri']
    require(same_json(get_template(r, 'Original', created['Id']), template), 'Prepared source template differs')
    inspect_templates(processed, get_template(r, 'Processed', created['Id']), code)
    print('NEW change set: all pages, exact resource/property scope and entire processed template VERIFIED.', flush=True)
    require(approve('Review exactly ApiFunction.Code and HttpApi.Body (same integrations, preserved private IAM); type EXECUTE ' + name + ': ').strip() == 'EXECUTE ' + name, 'Exact API change set not approved')
    r.paused(); verify_private(r, meta, meta['baseRuntimeSha256'])
    require(same_json(get_template(r, 'Original'), old_template) and same_json(get_template(r, 'Processed'), processed) and same_json(route_configuration(r), api_before), 'Stack/API changed after review; stop')
    reviewed = describe(r, created['Id']); inspect_changes(reviewed, r.resources)
    require(same_json(get_template(r, 'Original', created['Id']), template), 'Prepared source changed after review')
    inspect_templates(processed, get_template(r, 'Processed', created['Id']), code)
    state['executionStarted'] = True; save()
    with failure_stage('change-set-execute'):
        r.cf.execute_change_set(StackName=r.meta['stack'], ChangeSetName=created['Id'])
    with failure_stage('stack-update-wait'):
        r.cf.get_waiter('stack_update_complete').wait(StackName=r.meta['stack'])
    verify_private(r, meta, meta['runtimeSha256'])
    require(same_json(route_configuration(r), api_before), 'Live route/integration settings changed; keep enrollment closed')
    require(same_json(get_template(r, 'Original'), template), 'Deployed source differs')
    inspect_templates(processed, get_template(r, 'Processed'), code)
    state['deployed'] = True; save()


@failure_stage('fresh-consent-hold')
def hold_for_fresh_consent(helper, r, meta):
    verify_private(r, meta, meta['runtimeSha256'])
    r.paused(); verify_claim(helper, r)
    # The old token was exposed. Never arm confirmation, replay that capability,
    # mark consent verified, or advance the original confirmation/test checkpoint.
    (HERE / 'DEPLOYMENT-RECEIPT.json').write_text(json.dumps({'patchId': meta['patchId'], 'apiRuntimeSha256': meta['runtimeSha256'],
        'originalReleaseId': meta['originalReleaseId'], 'deployment': 'VERIFIED', 'freshConsent': 'REQUIRED',
        'unsubscribeAndFeedback': 'NOT_RUN', 'registration': 'CLOSED', 'confirmationGate': 'CLOSED',
        'weeklyDelivery': 'OFF', 'emailSent': False, 'oldTokenReused': False}, indent=2) + '\n')
    print('Deployment VERIFIED. Enrollment/confirmation CLOSED; weekly OFF. Exposed token must not be reused. Fresh consent testing requires separate approval; see RUNBOOK.md. Existing records/claims/checkpoints preserved; no email sent.')


@failure_stage('startup')
def main():
    os.umask(0o077)
    import fcntl
    lock = os.open('/tmp/chronoverse-newsletter-v2-private-release.lock', os.O_CREAT | os.O_WRONLY, 0o600)
    try: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError: raise RuntimeError('Another newsletter release process is running')
    with failure_stage('source-checksums'):
        for line in (HERE / 'SHA256SUMS').read_text().splitlines():
            expected, name = line.split('  ', 1)
            require('..' not in pathlib.PurePosixPath(name).parts and '\\' not in name and not name.startswith('/') and sha((HERE/name).read_bytes()) == expected, 'Patch checksum mismatch')
    parser = argparse.ArgumentParser(); parser.add_argument('original_directory', type=pathlib.Path, nargs='?'); args = parser.parse_args()
    meta = read(HERE / 'patch.json')
    path = HERE / '.confirmation-fix-state.json'
    state = read(path) if path.exists() else {}
    chosen = args.original_directory or state.get('originalDirectory') or input('Absolute directory of the EXISTING successful private release (with its hidden checkpoint): ').strip()
    directory = pathlib.Path(chosen).resolve()
    helper, r = original_release(directory, meta)
    if not state: state = {'patchId': meta['patchId'], 'originalDirectory': str(directory)}
    require(state.get('patchId') == meta['patchId'] and state.get('originalDirectory') == str(directory), 'Patch checkpoint target mismatch')
    def save():
        temporary = path.with_suffix('.tmp')
        with temporary.open('w') as stream: json.dump(state, stream, indent=2); stream.flush(); os.fsync(stream.fileno())
        os.replace(temporary, path)
    try:
        verify_closed(r)
        deploy(r, directory, meta, state, save)
        helper, r = original_release(directory, meta)
        hold_for_fresh_consent(helper, r, meta)
    except (Exception, KeyboardInterrupt):
        try: verify_closed(r)
        except (Exception, KeyboardInterrupt) as error:
            print(json.dumps({'FailureReadback': failure_details(error)}), flush=True)
            print('CLOSURE UNVERIFIED: stop for review. No CONTROL or schedule write attempted.', flush=True)
        raise


def run():
    try: main()
    except (Exception, KeyboardInterrupt) as error:
        print(json.dumps({'Failure': failure_details(error)}), flush=True)
        print('STOP: preserve all checkpoints and the existing email; never reset, resend or replay uncertain execution.', flush=True)
        raise SystemExit(1)


if __name__ == '__main__': run()
