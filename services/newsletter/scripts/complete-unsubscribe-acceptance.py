"""One operator-authorized API-code correction and targeted unsubscribe; no gate writes or mail.

Run only the pinned, reviewed version in authenticated eu-north-1 CloudShell.
All archives, keys, capabilities and record snapshots stay in process memory.
An uncertain write stops the operation; it never retries execution or rolls back.
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
import uuid
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


def corrected_archive(blob):
    """Use the exact live PATCHED archive, never a checkout or BASE runtime."""
    require(sha(blob) == BASE, 'runtime_baseline')
    output = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(blob)) as old:
        names = old.namelist()
        require(len(names) == len(set(names)) and old.testzip() is None, 'archive_integrity')
        original = old.read('src/http.mjs')
        require(sha(original) == OLD_HTTP, 'http_baseline')
        before = b'if (action === "confirm") page.headers["referrer-policy"] = "strict-origin";'
        require(original.count(before) == 1, 'single_source_change')
        corrected = original.replace(before, b'page.headers["referrer-policy"] = "strict-origin";')
        require(sha(corrected) == NEW_HTTP, 'reviewed_source')
        with zipfile.ZipFile(output, 'w') as new:
            for entry in old.infolist():
                new.writestr(copy.copy(entry), corrected if entry.filename == 'src/http.mjs' else old.read(entry.filename))
        with zipfile.ZipFile(io.BytesIO(output.getvalue())) as new:
            require(new.namelist() == names and new.testzip() is None, 'result_integrity')
            require([n for n in names if old.read(n) != new.read(n)] == ['src/http.mjs'], 'runtime_isolation')
    return output.getvalue()


def validate_change_set(change, current, processed):
    require(change.get('Status') == 'CREATE_COMPLETE' and change.get('ExecutionStatus') == 'AVAILABLE', 'change_set_state')
    changes = change.get('Changes', [])
    require(len(changes) == 1, 'change_set_count')
    r = changes[0].get('ResourceChange', {})
    require(r.get('LogicalResourceId') == 'ApiFunction' and r.get('ResourceType') == 'AWS::Lambda::Function'
            and r.get('Action') == 'Modify' and r.get('Replacement') == 'False'
            and r.get('Scope') == ['Properties'], 'change_set_scope')
    require(r.get('Details') and all(d.get('Target', {}).get('Attribute') == 'Properties'
            and d['Target'].get('Name') == 'Code' and d['Target'].get('RequiresRecreation') == 'Never'
            for d in r['Details']), 'code_only_details')
    candidate = copy.deepcopy(processed)
    candidate['Resources']['ApiFunction']['Properties']['Code'] = current['Resources']['ApiFunction']['Properties']['Code']
    require(canonical(candidate) == canonical(current), 'processed_template_isolation')


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
    def __init__(self, session, recipient, preserve):
        # No default identity; the owner-approved command supplies both inboxes.
        normalize = lambda s: s.strip().lower()
        self.recipient, self.preserve = normalize(recipient), normalize(preserve)
        require(self.recipient != self.preserve and all(re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', e)
                for e in [self.recipient, self.preserve]), 'distinct_identities')
        self.identity, self.historical = [sha(e.encode()) for e in [self.recipient, self.preserve]]
        self.session = session
        from botocore.config import Config
        config = Config(retries={'total_max_attempts': 1}, connect_timeout=10, read_timeout=70)
        self.clients = {s: session.client(s, region_name=REGION, config=config) for s in
                        ['sts', 'lambda', 'cloudformation', 's3', 'dynamodb', 'sesv2', 'scheduler', 'apigatewayv2']}
        self.stage, self.change_set = 'preflight', None

    def read_template(self, **params):
        body = self.clients['cloudformation'].get_template(**params)['TemplateBody']
        return json.loads(body) if isinstance(body, str) else body

    def stack(self):
        return self.clients['cloudformation'].describe_stacks(StackName=STACK)['Stacks'][0]

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
            while True:
                response = getattr(api, operation)(**args)
                output.extend(response.get(field, []))
                if not response.get('NextToken'):
                    break
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
            result[r['RouteKey']] = {k: r.get(k) for k in ['Target', 'AuthorizationType', 'AuthorizationScopes', 'AuthorizerId']}
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

    def deploy(self):
        self.stage = 'deployment_preflight'
        cf, s3, lam = [self.clients[s] for s in ['cloudformation', 's3', 'lambda']]
        original = self.read_template(StackName=STACK, TemplateStage='Original')
        processed = self.read_template(StackName=STACK, TemplateStage='Processed')
        stack = self.stack()
        require(stack['StackStatus'] == 'UPDATE_COMPLETE', 'stack_ready')
        location = original['Resources']['ApiFunction']['Properties']['CodeUri']
        require(location['Bucket'] == BUCKET and location.get('Version'), 'versioned_runtime')
        blob = s3.get_object(Bucket=BUCKET, Key=location['Key'], VersionId=location['Version'])['Body'].read()
        hashes = self.function_hashes()
        require(all(hashes[k] == base64.b64encode(bytes.fromhex(OTHER_BASE)).decode() for k in hashes if k != 'api'), 'four_base_runtimes')
        require(base64.b64encode(hashlib.sha256(blob).digest()).decode() == hashes['api'], 'template_matches_live_runtime')
        with zipfile.ZipFile(io.BytesIO(blob)) as archive:
            http_hash = sha(archive.read('src/http.mjs'))
        if http_hash == NEW_HTTP:
            # This invocation does not adopt an unknown prior package as proven.
            raise SafetyStop('already_corrected_reconcile_before_resuming')
        package = corrected_archive(blob)
        require(s3.get_bucket_versioning(Bucket=BUCKET).get('Status') == 'Enabled', 'artifact_versioning')
        digest = sha(package)
        key = 'newsletter-unsubscribe-fix/' + digest + '/runtime.zip'
        self.stage = 'immutable_artifact_upload'
        uploaded = s3.put_object(Bucket=BUCKET, Key=key, Body=package, IfNoneMatch='*',
                                ContentType='application/zip', ServerSideEncryption='AES256', Metadata={'sha256': digest})
        require(uploaded.get('VersionId'), 'artifact_version')
        candidate = copy.deepcopy(original)
        candidate['Resources']['ApiFunction']['Properties']['CodeUri'] = {'Bucket': BUCKET, 'Key': key, 'Version': uploaded['VersionId']}
        self.stage = 'create_code_only_change_set'
        args = {'StackName': STACK, 'ChangeSetName': 'unsubscribe-' + digest[:20], 'ChangeSetType': 'UPDATE',
                'TemplateBody': json.dumps(candidate), 'Parameters': [{'ParameterKey': p['ParameterKey'], 'UsePreviousValue': True} for p in stack.get('Parameters', [])],
                'Capabilities': stack.get('Capabilities', []), 'ClientToken': str(uuid.uuid4()), 'Tags': stack.get('Tags', [])}
        if stack.get('RoleARN'):
            args['RoleARN'] = stack['RoleARN']
        self.change_set = args['ChangeSetName']
        self.change_set = cf.create_change_set(**args)['Id']
        for _ in range(40):
            change = cf.describe_change_set(ChangeSetName=self.change_set)
            if change['Status'] not in ['CREATE_PENDING', 'CREATE_IN_PROGRESS']:
                break
            time.sleep(3)
        reviewed = self.read_template(StackName=STACK, ChangeSetName=self.change_set, TemplateStage='Processed')
        validate_change_set(change, processed, reviewed)
        self.closed()
        require(self.histories() == self.history and self.routes() == self.route_snapshot
                and self.function_hashes() == hashes and canonical(original) == canonical(self.read_template(StackName=STACK, TemplateStage='Original')),
                'pre_execution_state_unchanged')
        require(self.stack().get('LastUpdatedTime') == stack.get('LastUpdatedTime'), 'stack_not_advanced')
        self.stage = 'execute_code_only_change_set_no_retry'
        cf.execute_change_set(ChangeSetName=self.change_set, ClientRequestToken=str(uuid.uuid4()))
        self.stage = 'post_execution_reconciliation'
        for _ in range(80):
            current = self.stack()
            if current['StackStatus'] != 'UPDATE_COMPLETE' or current.get('ChangeSetId') != self.change_set:
                require(current['StackStatus'] in ['UPDATE_COMPLETE', 'UPDATE_IN_PROGRESS', 'UPDATE_COMPLETE_CLEANUP_IN_PROGRESS'], 'stack_failed')
                time.sleep(3)
                continue
            break
        require(current['StackStatus'] == 'UPDATE_COMPLETE' and current.get('ChangeSetId') == self.change_set, 'approved_execution_completed')
        require(canonical(self.read_template(StackName=STACK, TemplateStage='Processed')) == canonical(reviewed), 'executed_template')
        now = self.function_hashes()
        require(now['api'] == base64.b64encode(hashlib.sha256(package).digest()).decode()
                and all(now[k] == hashes[k] for k in hashes if k != 'api'), 'lambda_isolation')
        config = lam.get_function_configuration(FunctionName=self.arn)
        require(config['State'] == 'Active' and config['LastUpdateStatus'] == 'Successful', 'lambda_ready')
        require(self.routes() == self.route_snapshot and self.histories() == self.history, 'post_execution_isolation')
        self.closed()
        print(json.dumps({'apiCorrection': 'DEPLOYED', 'runtimeSha256': digest, 'httpSourceSha256': NEW_HTTP,
                          'stack': 'UPDATE_COMPLETE', 'changeSetId': self.change_set, 'lambdaVersion': config['Version'], 'revisionId': config['RevisionId']}), flush=True)

    def acceptance(self):
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
            require(http('POST', '/unsubscribe', token, body)[0] == 200, 'idempotent_response')
            require(self.row('SUB#' + self.identity) == suppressed and self.row(audit_key) == audit, 'idempotent_state')
        require(self.histories() == self.history, 'historical_and_claim_isolation')
        self.closed()
        print(json.dumps({'unsubscribe': 'PASS', 'state': 'SUPPRESSED', 'ses': 'OPT_OUT', 'audience': 'EXCLUDED',
                          'idempotency': 'PASS', 'historicalAndClaims': 'UNCHANGED', 'emailSendCalls': 0,
                          'control': 'false,false,false', 'recurringSchedules': 'DISABLED', 'nativeBrowser': 'NOT_EXERCISED'}), flush=True)

    def run(self):
        # Add the secret client only in this trusted execution context; never export keys.
        from botocore.config import Config
        require(self.clients['sts'].get_caller_identity()['Account'] == ACCOUNT, 'expected_account')
        config = self.clients['lambda'].get_function_configuration(FunctionName=STACK + '-api')
        self.arn = config['FunctionArn']
        require(self.arn == 'arn:aws:lambda:' + REGION + ':' + ACCOUNT + ':function:' + STACK + '-api', 'expected_function')
        env = config['Environment']['Variables']
        self.table, self.secret_arn, self.contact_list = env['TABLE_NAME'], env['SECRETS_ARN'], env['CONTACT_LIST']
        require(self.table == 'chronoverse-newsletter-v2-Ledger-E1NO71WDMT6H'
                and self.contact_list == 'chronoverse-newsletter-v2-weekly'
                and self.secret_arn == 'arn:aws:secretsmanager:eu-north-1:957261948953:secret:chronoverse/newsletter-v2-L90Yt8', 'expected_resources')
        self.clients['secretsmanager'] = self.session.client('secretsmanager', region_name=REGION,
            config=Config(retries={'total_max_attempts': 1}, connect_timeout=10, read_timeout=30))
        self.closed()
        self.history, self.route_snapshot = self.histories(), self.routes()
        self.deploy()
        self.acceptance()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--recipient', required=True)
    parser.add_argument('--preserve', required=True)
    args = parser.parse_args()
    operation = None
    try:
        logging.disable(logging.CRITICAL)
        import boto3
        session = boto3.Session(region_name=REGION)
        operation = Operation(session, args.recipient, args.preserve)
        operation.run()
    except (Exception, KeyboardInterrupt) as error:
        # No exception text, traceback, locals, subscriber data, URLs or SDK responses.
        print(json.dumps({'result': 'STOP', 'stage': operation.stage if operation else 'startup',
                          'exceptionClass': type(error).__name__, 'automaticReplay': False,
                          'check': str(error) if isinstance(error, SafetyStop) else 'provider_or_execution_failure',
                          'changeSetId': operation.change_set if operation else None}), flush=True)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
