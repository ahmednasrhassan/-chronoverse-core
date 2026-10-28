"""Pinned continuation for ONE existing change set and the approved unsubscribe.

Default is read-only preview. --execute-existing requires an explicit terminal
acknowledgement. No package creation/upload, change-set creation, gate writes,
mail sends, checkpoints, receipts or automatic recovery. Sensitive data stays
in memory. Derived helpers retain the reviewed b0324c8 signing/HTTP contract.
"""
import argparse
import base64
import copy
import hashlib
import hmac
import io
import json
import logging
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

ACCOUNT, REGION, STACK = '957261948953', 'eu-north-1', 'chronoverse-newsletter-v2'
API, ORIGIN = 'lh71lvbqi8', 'https://lh71lvbqi8.execute-api.eu-north-1.amazonaws.com'
BASE = '638f813fa3682caf7ccdbac556e557b65928c036836ce5221337b65bdacca150'
OTHER_BASE = '89636d5a22d004e9274a0a6190a46de1904a2c7516cfa70624f62845a3f258c8'
OLD_HTTP = '56ed52d8bd33cfefb21f65d5035c528316c260845a1081a63de5518cd1b6e637'
NEW_HTTP = '5cdf5812e4c161c53e072c337c0ce00b362b1a762a56d6c22bcfac97ab7fd8be'
BUCKET = 'chronoverse-nl-artifacts-957261948953-eun1'
PRIVATE = {'GET /register', 'POST /register', 'POST /subscribe'}
ROUTES = PRIVATE | {m + ' ' + p for m in ['GET', 'POST'] for p in
                      ['/confirm', '/unsubscribe', '/api/newsletter/confirm', '/api/newsletter/unsubscribe']}


def require(ok, check):
    if not ok:
        raise SafetyStop(check)


class SafetyStop(RuntimeError):
    """Messages are fixed check identifiers, never provider responses."""


def sha(blob):
    return hashlib.sha256(blob).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), default=str)



CHANGE_SET = 'arn:aws:cloudformation:eu-north-1:957261948953:changeSet/unsubscribe-0c7a8f2124d9fd650086/f6f261fb-01bd-412f-bf85-d68c94bc3d7b'
STACK_ID = 'arn:aws:cloudformation:eu-north-1:957261948953:stack/chronoverse-newsletter-v2/93e6b9d0-d087-11f1-917c-0affe37ad0f5'
PREVIOUS_CHANGE_SET = 'arn:aws:cloudformation:eu-north-1:957261948953:changeSet/confirmation-post-fix-6ee620a8c933-83247fbd/87d583c2-5d83-445d-b9d6-162e36a3e3a3'
PACKAGE_SHA = '0c7a8f2124d9fd65008688ab57c07eaa529d3547f742e82faeee54df873680e1'
PACKAGE_KEY = 'newsletter-unsubscribe-fix/' + PACKAGE_SHA + '/runtime.zip'
PACKAGE_VERSION = 'sgeS4R8EBiIYVysPcqLYdg7_nccfMru9'
BASE_KEY = 'newsletter-confirmation-fixes/confirmation-post-fix-6ee620a8c933/' + BASE + '/runtime.zip'
BASE_VERSION = '3.bc4ePvGDdQQ1_czt6oJquBgKOha4vf'
RECIPIENT = 'on9026901@gmail.com'
HISTORICAL_ID = '7ccc191e452b3e57369cec3fb97ed105322a492099267128c67ae12f390e2e7e'
FUNCTIONS = ['api', 'planner', 'worker', 'feedback', 'contacts']
ACKNOWLEDGEMENT = 'EXECUTE_EXISTING_AND_UNSUBSCRIBE'
MAX_ARCHIVE_BYTES = 16 * 1024 * 1024


def code_location(patched, original=False):
    key, version = (PACKAGE_KEY, PACKAGE_VERSION) if patched else (BASE_KEY, BASE_VERSION)
    return ({'Bucket': BUCKET, 'Key': key, 'Version': version} if original else
            {'S3Bucket': BUCKET, 'S3Key': key, 'S3ObjectVersion': version})


def validate_templates(current, candidate, original):
    """Compare the ENTIRE document, not only Resources or selected properties."""
    name = 'CodeUri' if original else 'Code'
    require(current['Resources']['ApiFunction']['Properties'][name] == code_location(False, original)
            and candidate['Resources']['ApiFunction']['Properties'][name] == code_location(True, original),
            'exact_versioned_code_locations')
    restored = copy.deepcopy(candidate)
    restored['Resources']['ApiFunction']['Properties'][name] = code_location(False, original)
    require(canonical(restored) == canonical(current), 'original_template_isolation' if original else 'processed_template_isolation')


def parameters(values):
    result = {}
    for p in values:
        key = p.get('ParameterKey')
        require(isinstance(key, str) and key not in result and 'ParameterValue' in p, 'parameter_inventory')
        result[key] = {k: p[k] for k in ['ParameterValue', 'ResolvedValue'] if k in p}
    return result


def validate_change_set(change, current, processed, executed=False):
    require(change.get('ChangeSetId') == CHANGE_SET and change.get('StackId') == STACK_ID
            and change.get('StackName') == STACK and change.get('ChangeSetName') == 'unsubscribe-' + PACKAGE_SHA[:20],
            'change_set_identity')
    require(change.get('Status') == 'CREATE_COMPLETE'
            and change.get('ExecutionStatus') == ('EXECUTE_COMPLETE' if executed else 'AVAILABLE'), 'change_set_state')
    require(not any(change.get(k) for k in ['IncludeNestedStacks', 'ParentChangeSetId', 'RootChangeSetId', 'ImportExistingResources',
                                           'DeploymentMode', 'DeploymentConfig', 'OnStackFailure']),
            'no_nested_or_import_changes')
    changes = change.get('Changes', [])
    require(len(changes) == 1, 'effective_change_set_count')
    item = changes[0]
    r = item.get('ResourceChange', {})
    require(item.get('Type') == 'Resource' and r.get('LogicalResourceId') == 'ApiFunction'
            and r.get('PhysicalResourceId') == STACK + '-api' and r.get('ResourceType') == 'AWS::Lambda::Function'
            and r.get('Action') == 'Modify' and r.get('Replacement') == 'False' and r.get('Scope') == ['Properties'],
            'change_set_scope')
    details = r.get('Details', [])
    expected = {'/Properties/Code/S3Key': (BASE_KEY, PACKAGE_KEY),
                '/Properties/Code/S3ObjectVersion': (BASE_VERSION, PACKAGE_VERSION)}
    seen = set()
    require(len(details) == 2, 'exact_code_details')
    for d in details:
        t = d.get('Target', {})
        path = t.get('Path')
        require(path in expected and path not in seen and t.get('Attribute') == 'Properties'
                and t.get('Name') == 'Code' and t.get('RequiresRecreation') == 'Never'
                and t.get('AttributeChangeType') == 'Modify' and d.get('Evaluation') == 'Static'
                and d.get('ChangeSource') == 'DirectModification' and not d.get('CausingEntity')
                and (t.get('BeforeValue'), t.get('AfterValue')) == expected[path], 'exact_code_details')
        seen.add(path)
    # AWS may include masked contexts. Compare them privately, never print them.
    if 'BeforeContext' in r or 'AfterContext' in r:
        before, after = [json.loads(r[k]) for k in ['BeforeContext', 'AfterContext']]
        require(before['Properties']['Code'] == code_location(False)
                and after['Properties']['Code'] == code_location(True), 'context_code_identity')
        after['Properties']['Code'] = before['Properties']['Code']
        require(canonical(before) == canonical(after), 'context_isolation')
    validate_templates(current, processed, False)


def validate_archive(baseline, package):
    require(sha(baseline) == BASE and sha(package) == PACKAGE_SHA, 'independent_archive_sha256')
    with zipfile.ZipFile(io.BytesIO(baseline)) as old, zipfile.ZipFile(io.BytesIO(package)) as new:
        names = old.namelist()
        require(names == new.namelist() and len(names) == len(set(names))
                and 'src/http.mjs' in names and old.comment == new.comment, 'archive_inventory')
        for archive in [old, new]:
            require(sum(i.file_size for i in archive.infolist()) <= 128 * 1024 * 1024
                    and all(not i.flag_bits & 1 for i in archive.infolist()), 'archive_bounds')
            require(archive.testzip() is None, 'archive_integrity')
        original, corrected = old.read('src/http.mjs'), new.read('src/http.mjs')
        before = b'if (action === "confirm") page.headers["referrer-policy"] = "strict-origin";'
        require(sha(original) == OLD_HTTP and sha(corrected) == NEW_HTTP and original.count(before) == 1
                and original.replace(before, b'page.headers["referrer-policy"] = "strict-origin";') == corrected,
                'reviewed_http_correction')
        require([n for n in names if old.read(n) != new.read(n)] == ['src/http.mjs'], 'runtime_member_isolation')


def capability(secret, identity, nonce):
    require(isinstance(secret, str) and len(secret.encode()) >= 32 and re.fullmatch('[a-f0-9]{64}', identity)
            and isinstance(nonce, str) and re.fullmatch('[A-Za-z0-9_-]{32}', nonce), 'signing_contract')
    encode = lambda value: base64.urlsafe_b64encode(value).rstrip(b'=').decode()
    body = encode(json.dumps({'purpose': 'unsubscribe', 'id': identity, 'nonce': nonce, 'exp': None}, separators=(',', ':')).encode())
    signed = 'v2.' + body
    return signed + '.' + encode(hmac.new(secret.encode(), signed.encode(), hashlib.sha256).digest())


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError('redirect_forbidden')


def http(method, path, token, body=None):
    # Never return or print request URLs, headers, capabilities or response bodies.
    url = ORIGIN + path + ('?token=' + urllib.parse.quote(token, safe='') if method == 'GET' else '')
    data = None if body is None else urllib.parse.urlencode(body).encode()
    request = urllib.request.Request(url, data=data, method=method, headers={
        'Origin': ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded'})
    try:
        response = urllib.request.build_opener(NoRedirect()).open(request, timeout=30)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        payload = response.read(65537)
        require(len(payload) <= 65536 and token.encode() not in payload, 'response_isolation')
        return response.code, response.headers.get('Referrer-Policy')


class Operation:
    def __init__(self, session):
        self.recipient = RECIPIENT
        self.identity, self.historical = sha(RECIPIENT.encode()), HISTORICAL_ID
        require(self.identity != self.historical, 'distinct_identities')
        self.session = session
        from botocore.config import Config
        config = Config(retries={'total_max_attempts': 1}, connect_timeout=10, read_timeout=70)
        self.clients = {s: session.client(s, region_name=REGION, config=config) for s in
                        ['sts', 'lambda', 'cloudformation', 's3', 'dynamodb', 'sesv2', 'scheduler', 'apigatewayv2']}
        self.stage, self.change_set = 'preflight', CHANGE_SET
        self.started = False
        self.execution_attempted = False

    def read_template(self, **params):
        body = self.clients['cloudformation'].get_template(**params)['TemplateBody']
        return json.loads(body) if isinstance(body, str) else body

    def stack(self):
        response = self.clients['cloudformation'].describe_stacks(StackName=STACK_ID)
        require(len(response['Stacks']) == 1, 'exact_stack')
        stack = response['Stacks'][0]
        require(stack.get('StackId') == STACK_ID and stack.get('StackName') == STACK, 'stack_identity')
        return stack

    def row(self, pk):
        return self.clients['dynamodb'].get_item(TableName=self.table, Key={'pk': {'S': pk}}, ConsistentRead=True).get('Item', {})

    def closed(self):
        control = self.row('CONTROL')
        require(all(isinstance(control.get(k), dict) and set(control[k]) == {'BOOL'} and control[k]['BOOL'] is False for k in
                    ['registrationEnabled', 'confirmationEnabled', 'deliveryEnabled']), 'control_closed')
        for name in ['chronoverse-newsletter-v2-weekly', 'chronoverse-newsletter-discovery-v2-daily-publications']:
            require(self.clients['scheduler'].get_schedule(Name=name)['State'] == 'DISABLED', 'schedules_disabled')

    def routes(self):
        api = self.clients['apigatewayv2']
        routes, integrations = [], []
        for operation, output, field in [('get_routes', routes, 'Items'), ('get_integrations', integrations, 'Items')]:
            args = {'ApiId': API}
            seen_tokens = set()
            while True:
                response = getattr(api, operation)(**args)
                output.extend(response.get(field, []))
                if not response.get('NextToken'):
                    break
                require(response['NextToken'] not in seen_tokens, 'route_pagination')
                seen_tokens.add(response['NextToken'])
                args['NextToken'] = response['NextToken']
        require(len(routes) == len(ROUTES) and {r['RouteKey'] for r in routes} == ROUTES, 'exact_routes')
        index = {i['IntegrationId']: i for i in integrations}
        require(len(index) == len(integrations) and all(isinstance(r.get('Target'), str)
                and r['Target'].startswith('integrations/') for r in routes), 'integration_inventory')
        require({r['Target'].removeprefix('integrations/') for r in routes} == set(index), 'integration_inventory')
        # SAM's OpenAPI integration uses the Lambda Invoke URI, not a bare ARN.
        # Accept only these two exact representations of the same unqualified
        # function. Never use suffix/substring matching or strip a qualifier.
        invoke_uri = 'arn:aws:apigateway:' + REGION + ':lambda:path/2015-03-31/functions/' + self.arn + '/invocations'
        result = {}
        for r in routes:
            require(r.get('AuthorizationType') == ('AWS_IAM' if r['RouteKey'] in PRIVATE else 'NONE'), 'route_authorization')
            i = index[r['Target'].removeprefix('integrations/')]
            require(i.get('IntegrationUri') in [self.arn, invoke_uri] and i.get('IntegrationType') == 'AWS_PROXY'
                    and i.get('IntegrationMethod') == 'POST' and i.get('PayloadFormatVersion') == '2.0'
                    and not i.get('CredentialsArn'), 'unqualified_proxy_target')
            result[r['RouteKey']] = {'route': copy.deepcopy(r), 'integration': copy.deepcopy(i)}
        return result

    def histories(self):
        result = {}
        for identity in [self.historical, self.identity]:
            record = self.row('SUB#' + identity)
            require(record, 'existing_identity')
            if identity == self.historical:
                result['historical'] = record
            nonce = record.get('confirmationNonce', record.get('confirmedRequestNonce', {})).get('S')
            require(nonce and re.fullmatch('[A-Za-z0-9_-]{32}', nonce), 'existing_claim_identity')
            pk = 'MAIL#confirmation#' + identity + '#' + nonce
            result[pk] = self.row(pk)
            require(result[pk], 'existing_claim')
        return result

    def function_hashes(self):
        return {name: self.clients['lambda'].get_function_configuration(FunctionName=STACK + '-' + name)['CodeSha256']
                for name in ['api', 'planner', 'worker', 'feedback', 'contacts']}


    def describe_existing(self):
        """Always opt into property values and consume ALL pages."""
        cf = self.clients['cloudformation']
        result, seen, token = None, set(), None
        while True:
            args = {'ChangeSetName': CHANGE_SET, 'StackName': STACK_ID, 'IncludePropertyValues': True}
            if token:
                args['NextToken'] = token
            page = cf.describe_change_set(**args)
            if result is None:
                result = copy.deepcopy(page)
                result['Changes'] = []
            else:
                keys = set(result) | set(page)
                for k in keys - {'Changes', 'NextToken', 'ResponseMetadata'}:
                    require(canonical(result.get(k)) == canonical(page.get(k)), 'change_set_page_consistency')
            require(isinstance(page.get('Changes', []), list), 'change_set_page_shape')
            result['Changes'].extend(page.get('Changes', []))
            token = page.get('NextToken')
            if not token:
                result.pop('NextToken', None)
                return result
            require(isinstance(token, str) and token not in seen, 'change_set_pagination')
            seen.add(token)

    def configurations(self):
        result = {}
        for name in FUNCTIONS:
            c = self.clients['lambda'].get_function_configuration(FunctionName=STACK + '-' + name)
            c.pop('ResponseMetadata', None)
            require(c.get('FunctionArn') == 'arn:aws:lambda:' + REGION + ':' + ACCOUNT + ':function:' + STACK + '-' + name
                    and c.get('Version') == '$LATEST' and c.get('State') == 'Active'
                    and c.get('LastUpdateStatus') == 'Successful', 'lambda_identity_and_readiness')
            result[name] = c
        return result

    def download(self, location, expected_hash):
        response = self.clients['s3'].get_object(Bucket=location['Bucket'], Key=location['Key'], VersionId=location['Version'])
        require(response.get('VersionId') == location['Version'] and response.get('ServerSideEncryption') == 'AES256'
                and type(response.get('ContentLength')) is int and 0 < response['ContentLength'] <= MAX_ARCHIVE_BYTES,
                'versioned_download_identity')
        with response['Body'] as body:
            blob = body.read(MAX_ARCHIVE_BYTES + 1)
        require(len(blob) == response['ContentLength'] and sha(blob) == expected_hash, 'downloaded_bytes_sha256')
        return blob

    def verify_opt_out(self):
        contact = self.clients['sesv2'].get_contact(ContactListName=self.contact_list, EmailAddress=self.recipient)
        preferences = contact.get('TopicPreferences', [])
        weekly = [p for p in preferences if p.get('TopicName') == 'weekly-research']
        require(contact.get('UnsubscribeAll') is True and len(weekly) == 1
                and weekly[0].get('SubscriptionStatus') == 'OPT_OUT', 'final_ses_opt_out')
        query = self.clients['dynamodb'].query(TableName=self.table, IndexName='Audience',
            KeyConditionExpression='audienceKey = :audience AND pk = :pk',
            ExpressionAttributeValues={':audience': {'S': 'AUDIENCE#' + str(int(self.identity[:2], 16) % 16)},
                                       ':pk': {'S': 'SUB#' + self.identity}}, ProjectionExpression='pk')
        require(not query.get('Items') and not query.get('LastEvaluatedKey'), 'final_audience_exclusion')

    def preflight(self):
        require(self.clients['sts'].get_caller_identity()['Account'] == ACCOUNT, 'expected_account')
        self.baseline_stack = self.stack()
        require(self.baseline_stack.get('StackStatus') == 'UPDATE_COMPLETE'
                and self.baseline_stack.get('ChangeSetId') == PREVIOUS_CHANGE_SET, 'live_stack_baseline')
        self.baseline_configs = self.configurations()
        require(all(c['CodeSha256'] == base64.b64encode(bytes.fromhex(BASE if name == 'api' else OTHER_BASE)).decode()
                    for name, c in self.baseline_configs.items()), 'five_runtime_baselines')
        config = self.baseline_configs['api']
        self.arn = config['FunctionArn']
        env = config['Environment']['Variables']
        self.table, self.secret_arn, self.contact_list = env['TABLE_NAME'], env['SECRETS_ARN'], env['CONTACT_LIST']
        require(self.table == 'chronoverse-newsletter-v2-Ledger-E1NO71WDMT6H'
                and self.contact_list == 'chronoverse-newsletter-v2-weekly'
                and self.secret_arn == 'arn:aws:secretsmanager:eu-north-1:957261948953:secret:chronoverse/newsletter-v2-L90Yt8',
                'expected_resources')
        self.closed()
        self.history, self.route_snapshot = self.histories(), self.routes()
        historical = self.history['historical']
        require(historical.get('state') == {'S': 'PENDING'} and 'suppressedAt' not in historical
                and 'suppressionReason' not in historical, 'historical_pending_baseline')
        before = self.row('SUB#' + self.identity)
        require(before.get('id') == {'S': self.identity} and before.get('email') == {'S': self.recipient}
                and before.get('state') == {'S': 'CONFIRMED'} and 'suppressedAt' not in before
                and 'suppressionReason' not in before, 'dedicated_confirmed_identity')
        self.subscriber_before = before
        contact = self.clients['sesv2'].get_contact(ContactListName=self.contact_list, EmailAddress=self.recipient)
        require(contact.get('UnsubscribeAll') is False
                and any(p.get('TopicName') == 'weekly-research' and p.get('SubscriptionStatus') == 'OPT_IN'
                        for p in contact.get('TopicPreferences', [])), 'dedicated_ses_baseline')
        self.original = self.read_template(StackName=STACK_ID, TemplateStage='Original')
        self.processed = self.read_template(StackName=STACK_ID, TemplateStage='Processed')
        self.candidate_original = self.read_template(StackName=STACK_ID, ChangeSetName=CHANGE_SET, TemplateStage='Original')
        self.candidate_processed = self.read_template(StackName=STACK_ID, ChangeSetName=CHANGE_SET, TemplateStage='Processed')
        validate_templates(self.original, self.candidate_original, True)
        validate_templates(self.processed, self.candidate_processed, False)
        self.check_change(self.describe_existing())
        require(self.clients['s3'].get_bucket_versioning(Bucket=BUCKET).get('Status') == 'Enabled', 'artifact_versioning')
        baseline = self.download(code_location(False, True), BASE)
        package = self.download(code_location(True, True), PACKAGE_SHA)
        validate_archive(baseline, package)
        self.fresh_guard()
        print(json.dumps({'preflight': 'PASS', 'changeSetId': CHANGE_SET, 'packageSha256': PACKAGE_SHA,
                          'baselineSha256': BASE, 'httpSourceSha256': NEW_HTTP, 'archiveIsolation': 'http.mjs_ONLY',
                          'control': 'false,false,false', 'recurringSchedules': 'DISABLED'}), flush=True)

    def check_change(self, change, executed=False):
        validate_change_set(change, self.processed, self.candidate_processed, executed)
        require(parameters(change.get('Parameters', [])) == parameters(self.baseline_stack.get('Parameters', [])),
                'parameters_unchanged')
        # DescribeChangeSet does not expose RoleARN. The pinned creating script
        # preserved the stack role; validate that role on the stack before/after.
        require(sorted(change.get('Capabilities', [])) == sorted(self.baseline_stack.get('Capabilities', []))
                and canonical(sorted(change.get('Tags', []), key=lambda t: t['Key']))
                == canonical(sorted(self.baseline_stack.get('Tags', []), key=lambda t: t['Key'])),
                'stack_execution_configuration')

    def fresh_guard(self):
        self.stage = 'final_read_only_guards'
        self.closed()
        require(self.histories() == self.history and self.row('SUB#' + self.identity) == self.subscriber_before,
                'pre_execution_records_unchanged')
        require(self.routes() == self.route_snapshot and self.configurations() == self.baseline_configs,
                'pre_execution_runtime_and_routes')
        current = self.stack()
        require(current.get('StackStatus') == 'UPDATE_COMPLETE'
                and current.get('ChangeSetId') == PREVIOUS_CHANGE_SET
                and current.get('LastUpdatedTime') == self.baseline_stack.get('LastUpdatedTime')
                and current.get('RoleARN') == self.baseline_stack.get('RoleARN')
                and parameters(current.get('Parameters', [])) == parameters(self.baseline_stack.get('Parameters', [])),
                'stack_not_advanced')
        for stage, expected, candidate in [('Original', self.original, self.candidate_original),
                                           ('Processed', self.processed, self.candidate_processed)]:
            require(canonical(self.read_template(StackName=STACK_ID, TemplateStage=stage)) == canonical(expected)
                    and canonical(self.read_template(StackName=STACK_ID, ChangeSetName=CHANGE_SET, TemplateStage=stage)) == canonical(candidate),
                    'templates_unchanged')
        self.check_change(self.describe_existing())
        self.closed()

    def execute_existing(self):
        require(not self.execution_attempted, 'execution_already_attempted')
        self.fresh_guard()
        self.execution_attempted = True
        self.stage = 'execute_existing_once_no_retry'
        self.clients['cloudformation'].execute_change_set(
            ChangeSetName=CHANGE_SET, StackName=STACK_ID, ClientRequestToken='resume-unsubscribe-' + PACKAGE_SHA[:32])
        # Any exception above escapes; no retry, rollback or unsubscribe.
        self.stage = 'authoritative_deployment_verification'
        for _ in range(120):
            stack = self.stack()
            if stack.get('StackStatus') == 'UPDATE_COMPLETE' and stack.get('ChangeSetId') == CHANGE_SET:
                break
            require(stack.get('StackStatus') in ['UPDATE_COMPLETE', 'UPDATE_IN_PROGRESS', 'UPDATE_COMPLETE_CLEANUP_IN_PROGRESS']
                    and stack.get('ChangeSetId') in [PREVIOUS_CHANGE_SET, CHANGE_SET], 'deployment_status')
            time.sleep(3)
        require(stack.get('StackStatus') == 'UPDATE_COMPLETE' and stack.get('ChangeSetId') == CHANGE_SET, 'exact_execution_completed')
        require(stack.get('RoleARN') == self.baseline_stack.get('RoleARN'), 'stack_execution_role_preserved')
        self.check_change(self.describe_existing(), executed=True)
        for stage, expected in [('Original', self.candidate_original), ('Processed', self.candidate_processed)]:
            require(canonical(self.read_template(StackName=STACK_ID, TemplateStage=stage)) == canonical(expected), 'deployed_template_identity')
        current = self.configurations()
        for name in FUNCTIONS:
            baseline, now = self.baseline_configs[name], current[name]
            if name == 'api':
                require(now['CodeSha256'] == base64.b64encode(bytes.fromhex(PACKAGE_SHA)).decode(), 'deployed_package_sha256')
                mutable = {'CodeSha256', 'CodeSize', 'LastModified', 'RevisionId', 'LastUpdateStatusReason', 'LastUpdateStatusReasonCode'}
                require({k: v for k, v in baseline.items() if k not in mutable}
                        == {k: v for k, v in now.items() if k not in mutable}, 'api_configuration_preserved')
            else:
                require(now == baseline, 'four_base_functions_preserved')
        require(self.routes() == self.route_snapshot and self.histories() == self.history
                and self.row('SUB#' + self.identity) == self.subscriber_before, 'post_execution_isolation')
        self.closed()
        self.deployment_verified = True
        print(json.dumps({'apiCorrection': 'DEPLOYED', 'changeSetId': CHANGE_SET, 'runtimeSha256': PACKAGE_SHA,
                          'stack': 'UPDATE_COMPLETE', 'fourOtherFunctions': 'UNCHANGED'}), flush=True)

    def acceptance(self):
        require(getattr(self, 'deployment_verified', False) is True, 'deployment_before_capability')
        self.closed()
        require(self.histories() == self.history and self.routes() == self.route_snapshot, 'pre_unsubscribe_isolation')
        self.stage = 'unsubscribe_review_cancel'
        before = self.row('SUB#' + self.identity)
        require(before.get('email') == {'S': self.recipient} and before.get('id') == {'S': self.identity}
                and before.get('state') == {'S': 'CONFIRMED'}, 'dedicated_confirmed_identity')
        secret = json.loads(self.clients['secretsmanager'].get_secret_value(SecretId=self.secret_arn)['SecretString'])
        token = capability(secret.get('capabilityKey'), self.identity, before.get('unsubscribeNonce', {}).get('S'))
        secret.clear()
        require(http('GET', '/unsubscribe', token) == (200, 'strict-origin'), 'live_review_policy')
        require(self.row('SUB#' + self.identity) == before and self.histories() == self.history, 'review_cancel_read_only')
        self.closed()
        require(self.histories() == self.history and self.row('SUB#' + self.identity) == before, 'pre_unsubscribe_state')
        self.stage = 'targeted_unsubscribe_no_retry'
        require(http('POST', '/unsubscribe', token, {'action': 'unsubscribe', 'token': token})[0] == 200, 'unsubscribe_response')
        suppressed = self.row('SUB#' + self.identity)
        permitted = {'state', 'suppressedAt', 'suppressionReason', 'audienceKey'}
        require(suppressed.get('state') == {'S': 'SUPPRESSED'} and suppressed.get('suppressionReason') == {'S': 'unsubscribe'}
                and 'suppressedAt' in suppressed and 'audienceKey' not in suppressed, 'authoritative_suppression')
        require({k: v for k, v in before.items() if k not in permitted} == {k: v for k, v in suppressed.items() if k not in permitted}, 'subscriber_fields_preserved')
        self.stage = 'ses_stream_and_audience_readback'
        for _ in range(30):
            contact = self.clients['sesv2'].get_contact(ContactListName=self.contact_list, EmailAddress=self.recipient)
            query = self.clients['dynamodb'].query(TableName=self.table, IndexName='Audience',
                KeyConditionExpression='audienceKey = :audience AND pk = :pk',
                ExpressionAttributeValues={':audience': {'S': 'AUDIENCE#' + str(int(self.identity[:2], 16) % 16)}, ':pk': {'S': 'SUB#' + self.identity}}, ProjectionExpression='pk')
            # Both index keys bind only this identity. An incomplete read still fails closed.
            absent = not query.get('Items') and not query.get('LastEvaluatedKey')
            opted_out = contact.get('UnsubscribeAll') is True and any(p['TopicName'] == 'weekly-research' and p['SubscriptionStatus'] == 'OPT_OUT' for p in contact.get('TopicPreferences', []))
            if absent and opted_out:
                break
            time.sleep(2)
        require(absent and opted_out, 'ses_and_audience_verified')
        self.stage = 'unsubscribe_idempotency'
        audit_key = 'AUDIT#' + self.identity + '#suppress#' + sha(('unsubscribe:' + sha(token.encode())).encode())
        audit = self.row(audit_key)
        require(audit, 'suppression_audit')
        for body in [{'action': 'unsubscribe', 'token': token}, {'List-Unsubscribe': 'One-Click', 'token': token}]:
            self.closed()
            require(self.histories() == self.history, 'pre_idempotency_isolation')
            require(http('POST', '/unsubscribe', token, body)[0] == 200, 'idempotent_response')
            require(self.row('SUB#' + self.identity) == suppressed and self.row(audit_key) == audit, 'idempotent_state')
        self.verify_opt_out()
        require(self.histories() == self.history and self.routes() == self.route_snapshot, 'historical_and_claim_isolation')
        self.closed()
        print(json.dumps({'unsubscribe': 'PASS', 'state': 'SUPPRESSED', 'ses': 'OPT_OUT', 'audience': 'EXCLUDED',
                          'idempotency': 'PASS', 'historicalAndClaims': 'UNCHANGED', 'emailSendCalls': 0,
                          'control': 'false,false,false', 'recurringSchedules': 'DISABLED', 'nativeBrowser': 'NOT_EXERCISED'}), flush=True)


    def run(self, execute=False):
        require(not self.started, 'invocation_already_started')
        self.started = True
        self.preflight()
        if not execute:
            print(json.dumps({'result': 'PREVIEW_ONLY', 'awsWrites': 0, 'capabilitiesCreated': 0,
                              'next': 'explicit_execute_existing_and_targeted_unsubscribe'}), flush=True)
            return
        self.execute_existing()
        from botocore.config import Config
        self.clients['secretsmanager'] = self.session.client('secretsmanager', region_name=REGION,
            config=Config(retries={'total_max_attempts': 1}, connect_timeout=10, read_timeout=30))
        self.acceptance()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute-existing', action='store_true')
    args = parser.parse_args()
    operation = None
    try:
        logging.disable(logging.CRITICAL)
        if args.execute_existing:
            require(input('Type EXECUTE_EXISTING_AND_UNSUBSCRIBE to execute the reviewed existing change set and dedicated unsubscribe: ').strip()
                    == ACKNOWLEDGEMENT, 'operator_acknowledgement')
        import boto3
        operation = Operation(boto3.Session(region_name=REGION))
        operation.run(args.execute_existing)
    except (Exception, KeyboardInterrupt) as error:
        print(json.dumps({'result': 'STOP', 'stage': operation.stage if operation else 'startup',
                          'exceptionClass': type(error).__name__, 'automaticReplay': False,
                          'check': str(error) if isinstance(error, SafetyStop) else 'provider_or_execution_failure',
                          'changeSetId': CHANGE_SET}), flush=True)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
