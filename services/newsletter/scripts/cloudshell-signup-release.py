"""Owner-run CloudShell procedure. Never uses connectors or website credentials.

No cloud operation runs on import. Every mutation requires an explicit CLI
approval switch. Only this release's newly created change sets can execute.
"""
import argparse, base64, datetime, decimal, fnmatch, hashlib, hmac, importlib.util, json, os, pathlib, re, time, urllib.error, urllib.parse, urllib.request, uuid

HERE = pathlib.Path(__file__).resolve().parent
FLAGS = ['DeliveryEnabled', 'RegistrationEnabled', 'ConfirmationEnabled', 'LegacyDispatchRetired', 'ComplianceApproved']
TEST_MAILBOX = os.environ.get('NEWSLETTER_TEST_MAILBOX', '')
OLD_CHANGESET = 'aws-register-origin-20261026'
ENROLLMENT_POLICY = 'aws-fresh-double-opt-in-2026-10-27-v1'
CONSENT_VERSION = 'weekly-research-v1'
CONSENT_TEXT = 'I agree to receive the free weekly Chronoverse Capital research newsletter. I can unsubscribe at any time.'
SUPPORT_EMAIL = 'info@chronoversecapital.com'
_init_spec = importlib.util.spec_from_file_location('audience_initialization', HERE / 'initialize-forward-audience.py')
audience = importlib.util.module_from_spec(_init_spec); _init_spec.loader.exec_module(audience)
def require(ok, message):
    if not ok: raise RuntimeError(message)
def sha(data): return hashlib.sha256(data).hexdigest()
def load(path): return json.loads(path.read_text())
def integer(value):
    return isinstance(value, (int, decimal.Decimal)) and not isinstance(value, bool) and value >= 0 and value <= 9007199254740991 and value == int(value)
def eligible(row):
    return bool(row and row.get('state') == 'CONFIRMED' and row.get('confirmedPolicy') == ENROLLMENT_POLICY and
        row.get('awsConsentVersion') == CONSENT_VERSION and row.get('awsConsentText') == CONSENT_TEXT and
        integer(row.get('awsRequestedAt')) and integer(row.get('confirmedAt')) and row['confirmedAt'] >= row['awsRequestedAt'] and
        re.fullmatch(r'[A-Za-z0-9_-]{32}', row.get('confirmedRequestNonce', '')) and
        re.fullmatch(r'[A-Za-z0-9_-]{32}', row.get('unsubscribeNonce', '')) and
        'suppressedAt' not in row and 'suppressionReason' not in row)
def canonical(row):
    # Preserve DynamoDB numeric types in private snapshots; do not conflate a
    # numeric timestamp with a historical string containing the same characters.
    def encode(value):
        if isinstance(value, decimal.Decimal): return {'$ddbDecimal': str(value)}
        raise TypeError('Unsupported private baseline value')
    return json.dumps(row, sort_keys=True, separators=(',', ':'), default=encode)
def public_parameters(previous, template, version, phase):
    forced = dict.fromkeys(FLAGS, 'false')
    forced.update(PublicOrigin='https://lh71lvbqi8.execute-api.eu-north-1.amazonaws.com', WeeklyScheduleEnabled='false', RuntimeObjectVersion=version,
                  RegistrationTestRecipient=TEST_MAILBOX if phase == 'test' else '')
    if phase in ['test', 'public']:
        forced.update(RegistrationEnabled='true', ConfirmationEnabled='true', LegacyDispatchRetired='true', ComplianceApproved='true')
    return [{'ParameterKey': name, 'ParameterValue': forced[name]} if name in forced else {'ParameterKey': name, 'UsePreviousValue': True}
            for name in template['Parameters'] if name in forced or name in previous]
def inspect_changes(changes):
    for entry in changes:
        r = entry.get('ResourceChange', {})
        require(r.get('Action') != 'Remove', 'Change set removes a resource; STOP')
        require(r.get('Replacement', 'False') == 'False', 'Change set may replace a resource; STOP')
        require(r.get('Action') != 'Add', 'Unexpected new physical resource; STOP for explicit review')
def token(key, purpose, identifier, nonce, expiry=None):
    body = base64.urlsafe_b64encode(json.dumps({'purpose': purpose, 'id': identifier, 'nonce': nonce, 'exp': expiry}, separators=(',', ':')).encode()).decode().rstrip('=')
    sig = base64.urlsafe_b64encode(hmac.new(key.encode(), ('v2.' + body).encode(), hashlib.sha256).digest()).decode().rstrip('=')
    return 'v2.' + body + '.' + sig

class Release:
    def __init__(self):
        require(re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', TEST_MAILBOX), 'Set private NEWSLETTER_TEST_MAILBOX explicitly; no default recipient')
        # CloudShell's own execution identity only. No access keys are packaged.
        import boto3
        self.meta = load(HERE / 'release.json')
        for line in (HERE / 'SHA256SUMS').read_text().splitlines():
            expected, name = line.split('  ', 1)
            require(pathlib.PurePosixPath(name).name == name, 'Unsafe manifest path')
            require(sha((HERE / name).read_bytes()) == expected, 'Release hash mismatch: ' + name)
        self.session = boto3.Session(region_name=self.meta['region'])
        self.clients = {}
        require(self.client('sts').get_caller_identity()['Account'] == self.meta['account'], 'Wrong AWS account')
        self.cf = self.client('cloudformation'); self.stack = self.cf.describe_stacks(StackName=self.meta['stack'])['Stacks'][0]
        require(self.stack['StackStatus'] in ['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'UPDATE_ROLLBACK_COMPLETE'], 'Stack not stable')
        self.resources = {r['LogicalResourceId']: r['PhysicalResourceId'] for page in self.cf.get_paginator('list_stack_resources').paginate(StackName=self.meta['stack']) for r in page['StackResourceSummaries']}
        require(self.resources.get('HttpApi') == 'lh71lvbqi8', 'Unexpected API identity; do not replace routes')
        self.table = self.session.resource('dynamodb').Table(self.resources['Ledger'])
        self.path = HERE / '.cloudshell-release-state.json'
        self.state = load(self.path) if self.path.exists() else {'releaseId': self.meta['releaseId']}
        require(self.state['releaseId'] == self.meta['releaseId'], 'State belongs to another release')
    def client(self, name):
        if name not in self.clients: self.clients[name] = self.session.client(name)
        return self.clients[name]
    def save(self):
        temporary = self.path.with_name(self.path.name + '.' + uuid.uuid4().hex + '.tmp')
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as stream:
            json.dump(self.state, stream, indent=2, default=str); stream.flush(); os.fsync(stream.fileno())
        os.replace(temporary, self.path)
    def control(self): return self.table.get_item(Key={'pk': 'CONTROL'}, ConsistentRead=True).get('Item', {})
    def subscriber(self): return self.table.get_item(Key={'pk': 'SUB#' + sha(TEST_MAILBOX.encode())}, ConsistentRead=True).get('Item')
    def configuration(self):
        return self.client('lambda').get_function_configuration(FunctionName=self.resources['ApiFunction'])['Environment']['Variables']
    def secret(self):
        response = self.client('secretsmanager').get_secret_value(SecretId=self.configuration()['SECRETS_ARN'])
        return json.loads(response['SecretString']), response['VersionId']
    def paused(self):
        c = self.control()
        require(c.get('deliveryEnabled') is False and c.get('registrationEnabled') is False and c.get('confirmationEnabled') is False,
                'Existing CONTROL must explicitly keep delivery, registration and confirmation false; never seed/reset it')
    def schedules_off(self):
        found = []
        for page in self.client('scheduler').get_paginator('list_schedules').paginate(NamePrefix='chronoverse'):
            for s in page['Schedules']:
                if 'newsletter' in s['Name'].lower() or 'discovery' in s['Name'].lower():
                    require(s['State'] == 'DISABLED', 'Newsletter/discovery schedule is not disabled'); found.append(s['Name'])
        require(found, 'No newsletter schedule inventoried; STOP')
    def subscribers(self):
        from boto3.dynamodb.conditions import Attr
        rows = {}; args = {'FilterExpression': Attr('pk').begins_with('SUB#'), 'ConsistentRead': True}
        while True:
            page = self.table.scan(**args)
            rows.update({row['pk']: row for row in page['Items']})
            if 'LastEvaluatedKey' not in page: return rows
            args['ExclusiveStartKey'] = page['LastEvaluatedKey']
    def capture_baseline(self):
        audience.verify(self)
        if 'historicalBaseline' in self.state: return
        self.paused(); first = self.subscribers(); second = self.subscribers()
        require(canonical(first) == canonical(second), 'Subscriber state changed during baseline scan; retry read-only baseline after feedback settles')
        require(not any(eligible(row) for row in first.values()), 'Unexpected preexisting fresh-policy records; STOP for explicit review')
        # Private 0600 operational evidence, never uploaded to Git or an artifact bucket.
        self.state['historicalBaseline'] = json.loads(canonical(first))
        self.state['historicalBaselineSha256'] = sha(canonical(first).encode())
        self.state['historicalCount'] = len(first); self.save()
    def initialize_audience(self, approved):
        return audience.initialize(self, approved, canonical, eligible)
    def isolation(self):
        require('historicalBaseline' in self.state, 'Capture baseline before updating runtime')
        baseline = self.state['historicalBaseline']
        require(sha(canonical(baseline).encode()) == self.state['historicalBaselineSha256'], 'Private baseline integrity mismatch')
        rows = self.subscribers()
        allowed_changes = {'state', 'confirmedAt', 'unsubscribeNonce', 'audienceKey', 'confirmedPolicy', 'awsConsentVersion', 'awsConsentText', 'awsRequestedAt', 'confirmedRequestNonce', 'suppressedAt', 'suppressionReason'}
        for pk, old in baseline.items():
            row = rows.get(pk); require(row is not None, 'Historical subscriber removed')
            for field, value in old.items():
                if field not in allowed_changes: require(canonical(row.get(field)) == canonical(value), 'Original subscriber/consent evidence changed')
            if old.get('state') == 'SUPPRESSED' or 'suppressedAt' in old or 'suppressionReason' in old:
                require(not eligible(row) and row.get('state') in [old.get('state'), 'SUPPRESSED'] and
                    all(canonical(row.get(field)) == canonical(old[field]) for field in ['suppressedAt', 'suppressionReason'] if field in old), 'Historical suppression changed')
            if eligible(row):
                nonce = row['confirmedRequestNonce']; identifier = row['id']
                audit = self.table.get_item(Key={'pk': f'AUDIT#{identifier}#confirm#{nonce}'}, ConsistentRead=True).get('Item', {})
                requested = self.table.get_item(Key={'pk': f'AUDIT#{identifier}#request#{nonce}'}, ConsistentRead=True).get('Item', {})
                require(audit.get('enrollmentPolicy') == requested.get('enrollmentPolicy') == ENROLLMENT_POLICY and
                    audit.get('kind') == 'confirmed' and audit.get('at') == row['confirmedAt'] and
                    requested.get('at') == row['awsRequestedAt'] and requested.get('consentText') == CONSENT_TEXT,
                    'Historical subscriber eligibility lacks new atomic mailbox confirmation evidence')
        self.state['isolationVerified'] = True; self.save()
        print('HISTORICAL ISOLATION PASS: ' + str(len(baseline)) + ' preserved baseline records; fresh confirmation required')
    def activation_allowed(self):
        if not getattr(self, 'meta', {}).get('privateSignupRepair'): return True
        state = getattr(self, 'state', {})
        return bool(state.get('testPassed') is True and state.get('unsubscribeObserved') is True and
                    state.get('feedbackMessageId') and state.get('bounceFeedbackMessageId') and state.get('activationApprovedRuntime') == self.meta.get('runtimeSha256') and
                    self.meta.get('runtimeSha256'))
    def prepare(self, phase, approved):
        require(phase in ['disabled', 'test'] or self.activation_allowed(), 'Private repair requires verified tests and separate public activation approval')
        require(approved, 'Upload/change-set preparation requires --approve')
        self.paused(); self.schedules_off()
        self.capture_baseline()
        if phase != 'disabled':
            self.readiness(False, False)
            require(audience.ready(self.control()), 'Verified audience initialization is incomplete')
        if phase == 'public': require(self.state.get('testPassed'), 'Controlled test has not passed')
        current = self.cf.get_template(StackName=self.meta['stack'], TemplateStage='Original')['TemplateBody']
        if isinstance(current, str): current = json.loads(current)
        template = load(HERE / 'main-template.json')
        require({k: v['Type'] for k, v in current['Resources'].items()} == {k: v['Type'] for k, v in template['Resources'].items()}, 'Source/deployed logical resource identities differ; STOP before upload')
        s3 = self.client('s3'); bucket = self.meta['bucket']
        require(s3.get_bucket_versioning(Bucket=bucket).get('Status') == 'Enabled', 'Artifact bucket must remain versioned')
        blob = (HERE / 'newsletter-runtime.zip').read_bytes()
        # Retry preparation may reuse only the exact immutable object/version.
        from botocore.exceptions import ClientError
        try:
            result = s3.put_object(Bucket=bucket, Key=self.meta['artifactKey'], Body=blob, IfNoneMatch='*', ServerSideEncryption='AES256',
                                   ContentType='application/zip', Metadata={'sha256': self.meta['runtimeSha256']})
            version = result.get('VersionId')
        except ClientError as e:
            if e.response['Error']['Code'] not in ['PreconditionFailed', '412']: raise
            existing = s3.get_object(Bucket=bucket, Key=self.meta['artifactKey'])
            require(sha(existing['Body'].read()) == self.meta['runtimeSha256'], 'Existing object is different; never overwrite')
            version = existing.get('VersionId')
        require(version and version != 'null', 'Missing S3 VersionId')
        params = public_parameters({p['ParameterKey'] for p in self.stack.get('Parameters', [])}, template, version, phase)
        body = json.dumps(template, separators=(',', ':')); require(len(body.encode()) <= 51200, 'TemplateBody exceeds CloudFormation limit')
        name = self.meta['releaseId'] + '-' + phase + '-' + uuid.uuid4().hex[:8]
        require(name != OLD_CHANGESET, 'Old change set forbidden')
        response = self.cf.create_change_set(StackName=self.meta['stack'], ChangeSetName=name, ChangeSetType='UPDATE', TemplateBody=body,
                  Parameters=params, Capabilities=['CAPABILITY_IAM', 'CAPABILITY_AUTO_EXPAND'], Description='Fresh AWS-only signup release; delivery and schedules OFF')
        self.cf.get_waiter('change_set_create_complete').wait(ChangeSetName=response['Id'], StackName=self.meta['stack'])
        changes = self.cf.describe_change_set(ChangeSetName=response['Id'], StackName=self.meta['stack'])
        inspect_changes(changes.get('Changes', []))
        require(not changes.get('NextToken'), 'Paginated change set needs explicit full review')
        (HERE / 'change-set-review.json').write_text(json.dumps({'ChangeSetName': name, 'ChangeSetId': response['Id'], 'Changes': changes.get('Changes', [])}, indent=2, default=str) + '\n')
        self.state['prepared'] = {'phase': phase, 'id': response['Id'], 'name': name, 'version': version}
        self.state.setdefault('rollback', {'stackId': self.stack['StackId'], 'originalTemplate': current, 'lambdaCodeSha256': self.client('lambda').get_function(FunctionName=self.resources['ApiFunction'])['Configuration']['CodeSha256']})
        self.save()
        print('PREPARED ' + name + '\nInspect every change, then execute this exact new change set with the next command. Nothing executed.')
    def execute(self, phase, approved):
        require(approved, 'Execution requires --approve'); self.paused(); self.schedules_off()
        saved = self.state.get('prepared', {})
        require(saved.get('phase') == phase and saved.get('name', '').startswith(self.meta['releaseId'] + '-' + phase + '-'), 'No matching fresh change set')
        changes = self.cf.describe_change_set(ChangeSetName=saved['id'], StackName=self.meta['stack']); inspect_changes(changes.get('Changes', []))
        require(changes['ExecutionStatus'] == 'AVAILABLE' and not changes.get('NextToken'), 'Change set unavailable/incomplete')
        self.cf.execute_change_set(ChangeSetName=saved['id'], StackName=self.meta['stack'])
        self.cf.get_waiter('stack_update_complete').wait(StackName=self.meta['stack'])
        self.state['deployedPhase'] = phase; self.save(); self.schedules_off()
        print('UPDATE COMPLETE; CONTROL and subscriber data were not modified. Registration remains durably paused.')
    def readiness(self, support_verified, historical_reconciled):
        audience.verify(self)
        self.schedules_off(); env = self.configuration(); secrets, version = self.secret()
        require(env.get('PUBLIC_ORIGIN') == self.meta['origin'], 'PUBLIC_ORIGIN mismatch')
        require(env.get('DELIVERY_ENABLED') == 'false' and self.control().get('deliveryEnabled') is False, 'Digest gate must remain off')
        require(isinstance(secrets.get('capabilityKey'), str) and len(secrets['capabilityKey'].encode()) >= 32, 'Existing v2 capabilityKey is missing/invalid; never generate or substitute credentials')
        if support_verified: self.state['supportVerified'] = True
        require(self.state.get('supportVerified'), 'Owner must verify monitored info@chronoversecapital.com and authenticated mailbox-ownership support workflow')
        self.isolation()
        require(env.get('SENDER_EMAIL') == SUPPORT_EMAIL, 'Unexpected SES sender; prepare a separate reviewed correction')
        if historical_reconciled: self.state['historicalFeedbackReconciled'] = True
        require(self.state.get('historicalFeedbackReconciled'), 'Historical feedback subscriptions need owner reconciliation; old website endpoint is 503')
        expected_code = base64.b64encode(bytes.fromhex(self.meta['runtimeSha256'])).decode()
        for logical in ['ApiFunction', 'PlannerFunction', 'WorkerFunction', 'FeedbackFunction', 'ContactSyncFunction']:
            fn = self.client('lambda').get_function(FunctionName=self.resources[logical])['Configuration']
            require(fn['CodeSha256'] == expected_code, 'Deployed runtime is not this release: ' + logical)
            require(fn['Environment']['Variables']['DELIVERY_ENABLED'] == 'false', 'A function has delivery enabled')
            if logical == 'WorkerFunction':
                role = fn['Role'].split('/')[-1]; iam = self.client('iam')
                require(not iam.list_attached_role_policies(RoleName=role)['AttachedPolicies'], 'Unexpected worker managed policy')
                for name in iam.list_role_policies(RoleName=role)['PolicyNames']:
                    for st in iam.get_role_policy(RoleName=role, PolicyName=name)['PolicyDocument']['Statement']:
                        actions = st.get('Action', []); actions = [actions] if isinstance(actions, str) else actions
                        require(st.get('Effect') != 'Allow' or ('NotAction' not in st and not any(fnmatch.fnmatchcase('ses:sendemail', a.lower()) or fnmatch.fnmatchcase('ses:sendrawemail', a.lower()) for a in actions)), 'Worker has SES send permission')
        ses = self.client('sesv2'); account = ses.get_account()
        require(account.get('ProductionAccessEnabled') and account.get('SendingEnabled'), 'SES production sending unavailable')
        identity = next(p['ParameterValue'] for p in self.stack['Parameters'] if p['ParameterKey'] == 'IdentityArn').split('identity/', 1)[1]
        require(ses.get_email_identity(EmailIdentity=identity).get('VerifiedForSendingStatus'), 'SES identity not verified')
        ses.get_contact_list(ContactListName=env['CONTACT_LIST'])
        destinations = ses.get_configuration_set_event_destinations(ConfigurationSetName=env['CONFIGURATION_SET'])['EventDestinations']
        require(any(d.get('Enabled') and d.get('SnsDestination', {}).get('TopicArn') == env['FEEDBACK_TOPIC_ARN'] and
                    {'BOUNCE', 'COMPLAINT', 'SUBSCRIPTION', 'DELIVERY', 'REJECT', 'RENDERING_FAILURE', 'DELIVERY_DELAY'} <= set(d.get('MatchingEventTypes', [])) for d in destinations), 'SES feedback destination missing/incomplete')
        topic = env['FEEDBACK_TOPIC_ARN']; queue = self.resources['FeedbackQueue']; sqs = self.client('sqs')
        attrs = sqs.get_queue_attributes(QueueUrl=queue, AttributeNames=['All'])['Attributes']; arn = attrs['QueueArn']
        require(attrs.get('SqsManagedSseEnabled') == 'true' or attrs.get('KmsMasterKeyId'), 'Feedback queue encryption missing')
        require('RedrivePolicy' in attrs, 'Feedback DLQ missing')
        require(int(attrs.get('ApproximateNumberOfMessages', '0')) == 0 and int(attrs.get('ApproximateNumberOfMessagesNotVisible', '0')) == 0, 'Feedback backlog needs processing before release')
        policy = json.loads(attrs['Policy'])
        require(any(st.get('Principal', {}).get('Service') == 'sns.amazonaws.com' and st.get('Resource') == arn and
                    st.get('Condition', {}).get('ArnEquals', {}).get('aws:SourceArn') == topic and
                    st.get('Condition', {}).get('StringEquals', {}).get('aws:SourceAccount') == self.meta['account'] for st in policy['Statement']), 'SNS-to-SQS source restrictions missing')
        topic_policy = json.loads(self.client('sns').get_topic_attributes(TopicArn=topic)['Attributes']['Policy'])
        configuration_arn = f"arn:aws:ses:{self.meta['region']}:{self.meta['account']}:configuration-set/{env['CONFIGURATION_SET']}"
        require(any(st.get('Principal', {}).get('Service') == 'ses.amazonaws.com' and st.get('Resource') == topic and
                    st.get('Condition', {}).get('StringEquals', {}).get('AWS:SourceAccount') == self.meta['account'] and
                    st.get('Condition', {}).get('ArnEquals', {}).get('AWS:SourceArn') == configuration_arn for st in topic_policy['Statement']), 'SES-to-SNS source restrictions missing')
        subscriptions = [s for page in self.client('sns').get_paginator('list_subscriptions_by_topic').paginate(TopicArn=topic) for s in page['Subscriptions']]
        require(not any(s['Protocol'] in ['http', 'https'] and '/api/newsletter/feedback' in s['Endpoint'] for s in subscriptions), 'Active feedback still targets website 503 endpoint')
        matching = [s for s in subscriptions if s['Protocol'] == 'sqs' and s['Endpoint'] == arn and s['SubscriptionArn'].startswith('arn:')]
        require(len(matching) == 1 and self.client('sns').get_subscription_attributes(SubscriptionArn=matching[0]['SubscriptionArn'])['Attributes'].get('RawMessageDelivery', 'false') == 'false', 'SNS envelope subscription not ready')
        mappings = self.client('lambda').list_event_source_mappings(FunctionName=self.resources['FeedbackFunction'], EventSourceArn=arn)['EventSourceMappings']
        require(len(mappings) == 1 and mappings[0]['State'] == 'Enabled' and 'ReportBatchItemFailures' in mappings[0].get('FunctionResponseTypes', []), 'Feedback mapping not ready')
        contacts = self.client('lambda').list_event_source_mappings(FunctionName=self.resources['ContactSyncFunction'])['EventSourceMappings']
        require(any(m['State'] == 'Enabled' for m in contacts), 'Contact suppression outbox is not enabled')
        dlq_arn = json.loads(attrs['RedrivePolicy'])['deadLetterTargetArn']
        dlq = sqs.get_queue_url(QueueName=dlq_arn.split(':')[-1], QueueOwnerAWSAccountId=self.meta['account'])['QueueUrl']
        require(int(sqs.get_queue_attributes(QueueUrl=dlq, AttributeNames=['ApproximateNumberOfMessages'])['Attributes']['ApproximateNumberOfMessages']) == 0, 'Feedback DLQ is nonempty')
        self.state['readiness'] = True; self.save(); print('READINESS PASS (configuration only; controlled delivery/suppression test still required)')
    def set_enrollment(self, enabled):
        condition, values = audience.approval(self.control()) if enabled else ('', {})
        self.table.update_item(Key={'pk': 'CONTROL'}, UpdateExpression='SET registrationEnabled=:new, confirmationEnabled=:new' + (', legacyRetired=:yes, complianceApproved=:yes' if enabled else ''),
            ConditionExpression='attribute_exists(pk) AND deliveryEnabled=:no' + (' AND registrationEnabled=:old AND confirmationEnabled=:old AND ' + condition if enabled else ''),
            ExpressionAttributeValues={':new': enabled, ':no': False, **({':old': False, ':yes': True, **values} if enabled else {})})
    def routes(self):
        return [r for page in self.client('apigatewayv2').get_paginator('get_routes').paginate(ApiId='lh71lvbqi8') for r in page['Items']]
    def arm(self, public, approved):
        require(not public or self.activation_allowed(), 'Private repair requires verified tests and separate public activation approval')
        require(approved, 'Enrollment mutation requires --approve (including retirement/compliance attestation)'); self.paused(); self.readiness(False, False)
        phase = 'public' if public else 'test'; require(self.state.get('deployedPhase') == phase, 'Deploy the corresponding reviewed change set first')
        if public: require(self.state.get('testPassed'), 'Controlled test incomplete')
        role = self.client('lambda').get_function_configuration(FunctionName=self.resources['ApiFunction'])['Role'].split('/')[-1]
        iam = self.client('iam'); require(not iam.list_attached_role_policies(RoleName=role)['AttachedPolicies'], 'Unexpected API managed policy')
        send_grants = 0
        identity_arn = next(p['ParameterValue'] for p in self.stack['Parameters'] if p['ParameterKey'] == 'IdentityArn')
        config_arn = f"arn:aws:ses:{self.meta['region']}:{self.meta['account']}:configuration-set/{self.configuration()['CONFIGURATION_SET']}"
        for policy in iam.list_role_policies(RoleName=role)['PolicyNames']:
            for st in iam.get_role_policy(RoleName=role, PolicyName=policy)['PolicyDocument']['Statement']:
                if st.get('Effect') != 'Allow': continue
                require('NotAction' not in st, 'Unreviewed API NotAction permission')
                actions = st.get('Action', []); actions = [actions] if isinstance(actions, str) else actions
                for action in actions:
                    if not any(fnmatch.fnmatchcase(name, action.lower()) for name in ['ses:sendemail', 'ses:sendrawemail']): continue
                    require(action.lower() == 'ses:sendemail', 'Unexpected API sending action')
                    resources = st.get('Resource', []); resources = [resources] if isinstance(resources, str) else resources
                    require(set(resources) == {identity_arn, config_arn}, 'API sending resources not exact')
                    require(st.get('Condition', {}).get('StringEquals', {}).get('ses:FromAddress') == self.configuration()['SENDER_EMAIL'], 'API sender condition missing')
                    if not public: require(st.get('Condition', {}).get('ForAllValues:StringEquals', {}).get('ses:Recipients') == [TEST_MAILBOX], 'Exact test-recipient restriction missing/bypassed')
                    send_grants += 1
        require(send_grants == 1, 'Expected exactly one API send grant')
        found = set()
        for route in self.routes():
            name = route['RouteKey']
            require(name != '$default' and '{proxy' not in name and not name.startswith('ANY '), 'Unreviewed catch-all route')
            if name in ['POST /subscribe', 'POST /register', 'GET /register']:
                found.add(name); self.client('apigatewayv2').update_route(ApiId='lh71lvbqi8', RouteId=route['RouteId'], AuthorizationType='NONE' if public else 'AWS_IAM')
        require(len(found) == 3, 'Admission route inventory mismatch')
        self.set_enrollment(True); self.save()
        print('PUBLIC SIGNUP OPEN; digest/discovery OFF' if public else 'PRIVATE SIGNUP TEST ARMED: only SigV4 operator enrollment; exact recipient restriction retained')
    def http(self, method, path, data=None, signed=False, origin=True):
        body = urllib.parse.urlencode(data).encode() if data is not None else None
        url = self.meta['origin'] + path; headers = {'Content-Type': 'application/x-www-form-urlencoded'}
        if origin: headers['Origin'] = self.meta['origin']
        if signed:
            from botocore.auth import SigV4Auth
            from botocore.awsrequest import AWSRequest
            req = AWSRequest(method=method, url=url, data=body, headers=headers)
            SigV4Auth(self.session.get_credentials().get_frozen_credentials(), 'execute-api', self.meta['region']).add_auth(req); headers = dict(req.headers)
        request = urllib.request.Request(url, data=body, headers=headers, method=method)
        # Never forward a signature or capability to a redirect destination.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl): return None
        def observed(status, response_headers):
            result = response_headers.get('x-newsletter-result', '')
            safe_results = ['bad_request', 'origin_denied', 'context_denied', 'unsupported_media', 'internal_failure', 'gate_closed', 'configuration', 'permission_denied', 'dependency_throttled', 'provider_rejected', 'dependency_failure', 'outcome_uncertain']
            self.state['lastHttp'] = {'method': method, 'status': status, 'signed': signed,
                'at': int(time.time() * 1000), 'result': result if result in safe_results else 'unspecified'}
            request_id = response_headers.get('apigw-requestid', '')
            if re.fullmatch(r'[A-Za-z0-9_+=/-]{8,100}', request_id): self.state['lastHttp']['gatewayRequestId'] = request_id
            self.save()
            print('HTTP ' + method + ' status=' + str(status) + ' signed=' + str(signed) + ' result=' + self.state['lastHttp']['result'])
            return status
        try:
            with urllib.request.build_opener(NoRedirect()).open(request, timeout=25) as response:
                return observed(response.status, response.headers)
        except urllib.error.HTTPError as e:
            try: return observed(e.code, e.headers)
            finally: e.close()
        except (urllib.error.URLError, TimeoutError, OSError):
            self.state['lastHttp'] = {'method': method, 'status': None, 'signed': signed, 'at': int(time.time() * 1000), 'result': 'transport_uncertain'}
            self.save()
            raise RuntimeError('HTTP transport outcome uncertain; no automatic retry. Inspect durable evidence.') from None
    def signup(self, approved):
        require(approved, 'One controlled email requires --approve'); require(self.state.get('deployedPhase') == 'test', 'Not in test phase')
        row = self.subscriber()
        recovering = self.state.get('signupAttempted') is True
        require(not recovering or self.state.get('recoveryAuthorized') is True, 'Mailbox already attempted; use explicit verified recovery, never automatically resend')
        if self.meta.get('privateSignupRepair'):
            require(self.state.get('importedCheckpoint'), 'Import the original failed release checkpoint first; a new directory is not a new attempt')
        require(not row or (row.get('state') in ['HOLD', 'CONFIRMED', 'PENDING'] and not eligible(row) and 'suppressedAt' not in row and 'suppressionReason' not in row), 'Authorized mailbox suppressed/already eligible; never reset it')
        require(not row or row.get('enrollmentPolicy') != ENROLLMENT_POLICY, 'Existing fresh pending test; inspect original claim instead of resending')
        require(self.http('GET', '/register') in [401, 403], 'Registration is not private')
        require(self.http('GET', '/register', signed=True) == 200, 'Signed AWS registration page failed')
        if recovering:
            spec = importlib.util.spec_from_file_location('signup_recovery', HERE / 'recover-private-signup.py')
            recovery = importlib.util.module_from_spec(spec); spec.loader.exec_module(recovery)
            recovery.consume(self)
        self.state['signupAttempted'] = True; self.save()
        status = self.http('POST', '/register', {'email': TEST_MAILBOX, 'consent': 'yes'}, signed=True)
        self.state['signupHttpStatus'] = status; self.save()
        require(status == 202, 'Signed POST /register returned HTTP ' + str(status) + '; inspect newsletter_gateway/newsletter_http in chronoverse-newsletter-v2-api. NEVER automatically retry')
        latest = self.subscriber()
        pending = self.table.get_item(Key={'pk': 'RENEW#' + sha(TEST_MAILBOX.encode())}, ConsistentRead=True).get('Item') if row else latest
        require(pending and pending['state'] == 'PENDING' and pending.get('enrollmentPolicy') == ENROLLMENT_POLICY and not eligible(latest), 'Fresh pending request not preserved')
        if row: require(canonical(row) == canonical(latest), 'Historical subscriber changed before new confirmation')
        self.state['confirmationClaim'] = 'MAIL#confirmation#' + pending['id'] + '#' + pending['confirmationNonce']; self.save()
        print('ONE signup request sent. Owner must observe actual inbox email and click its GET/review then POST confirmation; no resend.')
    def confirmed(self, approved):
        require(approved, '--approve attests actual inbox receipt and deliberate confirmation POST')
        row = self.subscriber(); require(eligible(row), 'Subscriber lacks fresh AWS confirmation receipt')
        self.isolation()
        claim = self.table.get_item(Key={'pk': self.state['confirmationClaim']}, ConsistentRead=True)['Item']
        require(claim['state'] == 'ACCEPTED' and claim.get('messageId'), 'Confirmation acceptance not durably recorded')
        contact = self.client('sesv2').get_contact(ContactListName=self.configuration()['CONTACT_LIST'], EmailAddress=TEST_MAILBOX)
        require(not contact.get('UnsubscribeAll') and any(t['TopicName'] == 'weekly-research' and t['SubscriptionStatus'] == 'OPT_IN' for t in contact.get('TopicPreferences', [])), 'Wait for confirmed contact outbox; do not reset or send again')
        self.state['confirmedObserved'] = True; self.state['providerMessageId'] = claim['messageId']; self.save(); print('CONFIRMATION VERIFIED against Ledger; owner attested inbox/interaction')
    def feedback_test(self, approved):
        require(approved and self.state.get('confirmedObserved'), 'Synthetic managed suppression requires confirmation evidence and --approve')
        require(self.state.get('unsubscribeObserved') and self.subscriber()['state'] == 'SUPPRESSED', 'First verify genuine unsubscribe transition; do not reset subscriber')
        for kind, key in [('Complaint', 'feedbackMessageId'), ('Bounce', 'bounceFeedbackMessageId')]:
            if self.state.get(key): continue
            event = {'eventType': kind, 'mail': {'destination': [TEST_MAILBOX], 'messageId': self.state['providerMessageId'], 'tags': {'id': [sha(TEST_MAILBOX.encode())]}},
                     'releaseTest': 'SYNTHETIC; not genuine SES feedback'}
            if kind == 'Complaint': event['complaint'] = {'complainedRecipients': [{'emailAddress': TEST_MAILBOX}]}
            else: event['bounce'] = {'bounceType': 'Permanent', 'bouncedRecipients': [{'emailAddress': TEST_MAILBOX}]}
            result = self.client('sns').publish(TopicArn=self.configuration()['FEEDBACK_TOPIC_ARN'], Message=json.dumps(event))
            self.state[key] = result['MessageId']; self.save(); print('Synthetic ' + kind + ' published through managed SNS/SQS; verify consumption next. No email sent.')
    def unsubscribe(self, approved):
        require(approved and self.state.get('confirmedObserved'), 'Authorized test unsubscribe requires --approve and confirmation evidence')
        row = self.subscriber(); require(row and (eligible(row) or (self.state.get('unsubscribeAttempted') and row['state'] == 'SUPPRESSED')), 'Need confirmed authorized record or a previous uncertain unsubscribe; never reset')
        secret, _ = self.secret(); cap = token(secret['capabilityKey'], 'unsubscribe', row['id'], row['unsubscribeNonce'])
        path = '/unsubscribe?token=' + cap
        require(self.http('GET', path) == 200 and self.subscriber() == row, 'GET mutated subscriber or failed')
        self.state['unsubscribeAttempted'] = True; self.save()
        require(self.http('POST', path, {'action': 'unsubscribe'}) == 200, 'Test unsubscribe failed')
        row = self.subscriber(); require(row['state'] == 'SUPPRESSED' and row.get('suppressionReason') == 'unsubscribe' and 'audienceKey' not in row, 'Unsubscribe did not durably suppress')
        require(self.http('POST', path, {'action': 'unsubscribe'}) == 200, 'Repeated unsubscribe failed')
        require(self.http('POST', path, {'List-Unsubscribe': 'One-Click'}, origin=False) == 200 and self.subscriber() == row, 'Email-client one-click unsubscribe failed or changed original suppression')
        bad = token(secret['capabilityKey'], 'unsubscribe', row['id'], 'x' * 32)
        require(self.http('POST', '/unsubscribe?token=' + bad, {'action': 'unsubscribe'}) == 400 and self.subscriber() == row, 'Invalid unsubscribe changed data')
        self.state['unsubscribeObserved'] = True; self.save(); print('UNSUBSCRIBE VERIFIED, including nonmutating GET, repeated POST and wrong nonce. Subscriber remains suppressed.')
    def finish(self):
        require(self.state.get('unsubscribeObserved') and self.state.get('feedbackMessageId'), 'Controlled steps incomplete')
        event_pk = 'EVENT#' + sha((self.state['feedbackMessageId'] + ':Complaint').encode())
        require(self.table.get_item(Key={'pk': event_pk}, ConsistentRead=True).get('Item'), 'Managed SNS/SQS synthetic complaint not processed')
        row = self.subscriber(); require(row['state'] == 'SUPPRESSED' and row.get('suppressionReason') == 'unsubscribe' and 'audienceKey' not in row, 'Feedback must preserve original unsubscribe suppression')
        audit_pk = 'AUDIT#' + row['id'] + '#suppress#' + sha(event_pk.removeprefix('EVENT#').encode())
        require(self.table.get_item(Key={'pk': audit_pk}, ConsistentRead=True).get('Item', {}).get('reason') == 'complaint', 'Synthetic complaint did not pass through suppression writer')
        if self.meta.get('privateSignupRepair') or self.state.get('bounceFeedbackMessageId'):
            require(self.state.get('bounceFeedbackMessageId'), 'Managed synthetic permanent-bounce verification is incomplete')
            bounce_pk = 'EVENT#' + sha((self.state['bounceFeedbackMessageId'] + ':Bounce').encode())
            require(self.table.get_item(Key={'pk': bounce_pk}, ConsistentRead=True).get('Item'), 'Managed SNS/SQS synthetic permanent bounce not processed')
            bounce_audit = 'AUDIT#' + row['id'] + '#suppress#' + sha(bounce_pk.removeprefix('EVENT#').encode())
            require(self.table.get_item(Key={'pk': bounce_audit}, ConsistentRead=True).get('Item', {}).get('reason') == 'hard-bounce', 'Synthetic bounce did not pass through suppression writer')
        contact = self.client('sesv2').get_contact(ContactListName=self.configuration()['CONTACT_LIST'], EmailAddress=TEST_MAILBOX)
        require(contact.get('UnsubscribeAll') is True, 'Contact suppression outbox not complete')
        # Read only this test's event metadata. Do not expose other subscribers.
        from boto3.dynamodb.conditions import Attr
        args = {'FilterExpression': Attr('subscriberId').eq(row['id']) & Attr('type').eq('Delivery') & Attr('providerMessageId').eq(self.state['providerMessageId']),
                'ProjectionExpression': 'pk, providerMessageId, subscriberId', 'ConsistentRead': True}
        delivered = False
        for _ in range(10):
            response = self.table.scan(**args); delivered |= bool(response['Items'])
            if delivered or 'LastEvaluatedKey' not in response: break
            args['ExclusiveStartKey'] = response['LastEvaluatedKey']
        require(delivered, 'Actual SES Delivery event has not reached the Ledger through feedback')
        self.isolation(); self.state['testPassed'] = True; self.save(); self.schedules_off(); print('CONTROLLED TEST PASS: actual SES confirmation Delivery event, fresh confirmation, unsubscribe transition and synthetic SNS/SQS complaint suppression audit (original opt-out preserved). No campaign sent.')
    def close(self, approved):
        require(approved, 'Closing enrollment requires --approve'); self.set_enrollment(False); self.schedules_off()
        print('Registration/confirmation durably CLOSED. Keys, records, claims, feedback and checkpoints preserved.')
    def support_optout(self, email, evidence, approved):
        require(approved, 'Authenticated operator opt-out requires --approve after verifying ownership')
        require(isinstance(email, str) and re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email) and email == email.strip().lower(), 'Need normalized verified mailbox')
        require(re.fullmatch(r'[a-f0-9]{64}', evidence or ''), 'Provide SHA-256 of privately retained authenticated mailbox-ownership support evidence')
        identifier = sha(email.encode()); pk = 'SUB#' + identifier
        row = self.table.get_item(Key={'pk': pk}, ConsistentRead=True).get('Item')
        require(row and row.get('id') == identifier and row.get('email') == email, 'No exact existing subscriber; do not create/guess identity from an unreadable token')
        # No public request can invoke this IAM-authenticated operation. Ownership
        # verification is an explicit operator attestation, never inferred from email text.
        self.table.update_item(Key={'pk': pk},
            UpdateExpression='SET #state=:suppressed, suppressedAt=if_not_exists(suppressedAt,:now), suppressionReason=if_not_exists(suppressionReason,:reason) REMOVE audienceKey',
            ConditionExpression='attribute_exists(pk) AND id=:id AND email=:email',
            ExpressionAttributeNames={'#state': 'state'},
            ExpressionAttributeValues={':suppressed': 'SUPPRESSED', ':now': int(time.time()*1000), ':reason': 'manual-verified-unsubscribe', ':id': identifier, ':email': email})
        audit = {'pk': 'AUDIT#' + identifier + '#support#' + evidence, 'kind': 'suppressed', 'reason': 'manual-verified-unsubscribe', 'evidenceSha256': evidence,
            'operatorArn': self.client('sts').get_caller_identity()['Arn'], 'at': int(time.time()*1000)}
        from botocore.exceptions import ClientError
        try: self.table.put_item(Item=audit, ConditionExpression='attribute_not_exists(pk)')
        except ClientError as error:
            if error.response['Error']['Code'] != 'ConditionalCheckFailedException': raise
        require(self.table.get_item(Key={'pk': pk}, ConsistentRead=True)['Item']['state'] == 'SUPPRESSED', 'Suppression readback failed')
        print('SUPPORT OPT-OUT RECORDED. Verify contact stream completes; preserve original evidence. No email sent.')
    def weekly_preflight(self):
        audience.verify(self)
        require(self.state.get('testPassed') and self.state.get('unsubscribeObserved'), 'Controlled live test incomplete')
        self.isolation(); c = self.control()
        cutover = 1792875600000  # 2026-10-24T21:00:00Z; never write/reset this value.
        require(audience.ready(c) and c.get('contentSourceApproved') is True and c.get('sanityPublishedStateApproved') is True and c.get('contentStartAt') == cutover,
                'Existing content/cutover approval is incomplete; do not invent or change it')
        head = self.table.get_item(Key={'pk': 'PUBLICATION#STATE'}, ConsistentRead=True).get('Item', {})
        require(head.get('status') == 'READY' and head.get('cutover') == cutover and integer(head.get('sequence')) and head['sequence'] >= 1 and
                integer(head.get('lastSuccessfulAt')) and 0 <= int(time.time()*1000) - head['lastSuccessfulAt'] <= 35*86400000, 'Publication checkpoint needs explicit review; never reset it')
        for name in ['PlanQueue', 'DigestQueue', 'FailureQueue', 'FeedbackQueue']:
            attrs = self.client('sqs').get_queue_attributes(QueueUrl=self.resources[name], AttributeNames=['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible', 'ApproximateNumberOfMessagesDelayed'])['Attributes']
            require(all(int(v) == 0 for v in attrs.values()), 'Nonempty ' + name + '; never purge or replay it')
        return head
    def prepare_weekly(self, website_sha, approved):
        require(self.activation_allowed(), 'Private repair requires verified tests and separate public activation approval')
        require(approved, 'Weekly release requires --approve only after the verified website deployment')
        require(re.fullmatch(r'[a-f0-9]{40}', website_sha or ''), 'Owner must supply verified live website commit SHA')
        require(self.state.get('deployedPhase') == 'public', 'Public enrollment stage not verified')
        self.schedules_off(); self.readiness(False, False); head = self.weekly_preflight()
        with urllib.request.urlopen('https://chronoversecapital.com/newsletter', timeout=25) as response:
            require(response.status == 200, 'Live website unavailable')
            page = response.read(1024*1024).decode('utf-8')
        require(('href="' + self.meta['origin'] + '/register"') in page, 'Live website does not publish the direct AWS registration link')
        # Discover the existing companion from execution configuration and CF tags;
        # never guess a stack name or create another stack.
        matches = [f for p in self.client('lambda').get_paginator('list_functions').paginate() for f in p['Functions'] if f.get('Handler') == 'src/discovery-handler.discover' and
            f.get('Environment', {}).get('Variables', {}).get('TABLE_NAME') == self.resources['Ledger']]
        require(len(matches) == 1, 'Need exactly one existing discovery companion')
        discovery = matches[0]; env = discovery['Environment']['Variables']
        require(env.get('SANITY_PROJECT_ID') == 'xfs4j01p' and env.get('SANITY_DATASET') == 'production' and env.get('ARTICLE_ORIGIN') == 'https://chronoversecapital.com' and
            env.get('CONTENT_BUCKET') == self.meta['bucket'] and env.get('CONTENT_MANIFEST_KEY') == 'newsletter-content/approved.json', 'Discovery source configuration mismatch')
        tags = self.client('lambda').list_tags(Resource=discovery['FunctionArn'])['Tags']; companion = tags.get('aws:cloudformation:stack-name')
        require(companion and companion != self.meta['stack'], 'Companion CloudFormation identity unavailable')
        # Statically pin the original 72-ID snapshot in this exact ZIP.
        import zipfile
        with zipfile.ZipFile(HERE / 'newsletter-runtime.zip') as archive:
            snapshot = json.loads(archive.read('src/legacy-publication-exclusions.json'))
        require(sha(json.dumps(snapshot, separators=(',', ':'), ensure_ascii=False).encode()) == '25bb03a09769f53ff429b82000cf3cab738d42b9daccdb36f54a50675d7ac6d5' and len(snapshot['excludedIds']) == 72, 'Legacy article exclusion integrity failed')
        s3 = self.client('s3'); require(s3.get_bucket_versioning(Bucket=self.meta['bucket']).get('Status') == 'Enabled', 'Manifest bucket versioning disabled')
        obj = s3.get_object(Bucket=self.meta['bucket'], Key='newsletter-content/approved.json')
        require(obj.get('VersionId') == head.get('versionId') and sha(obj['Body'].read()) == head.get('sha256'), 'Manifest/checkpoint mismatch; never overwrite or repair automatically')
        now = datetime.datetime.now(datetime.timezone.utc)
        next_monday = (now + datetime.timedelta(days=(7-now.weekday()) or 7)).replace(hour=9, minute=0, second=0, microsecond=0)
        self.close(True)
        prepared = []
        for kind, stack, schedule, switch in [('main', self.meta['stack'], 'WeeklySchedule', 'WeeklyScheduleEnabled'), ('discovery', companion, 'DailyDiscovery', 'DiscoveryScheduleEnabled')]:
            previous = self.cf.describe_stacks(StackName=stack)['Stacks'][0]
            require(previous['StackStatus'] in ['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'UPDATE_ROLLBACK_COMPLETE'], 'Stack not stable')
            old = self.cf.get_template(StackName=stack, TemplateStage='Original')['TemplateBody']; old = json.loads(old) if isinstance(old, str) else old
            template = load(HERE / (kind+'-template.json'))
            require({k:v['Type'] for k,v in old['Resources'].items()} == {k:v['Type'] for k,v in template['Resources'].items()}, 'Weekly update changes logical resource identities')
            template['Resources'][schedule]['Properties']['StartDate'] = (next_monday if kind == 'main' else now+datetime.timedelta(minutes=10)).isoformat()
            forced = dict.fromkeys(FLAGS, 'true'); forced.update({switch:'true', 'RuntimeObjectVersion':self.state['prepared']['version']})
            if kind == 'main': forced.update(RegistrationTestRecipient='', PublicOrigin=self.meta['origin'])
            previous_names = {p['ParameterKey'] for p in previous['Parameters']}
            params = [{'ParameterKey':k, 'ParameterValue':forced[k]} if k in forced else {'ParameterKey':k, 'UsePreviousValue':True} for k in template['Parameters'] if k in forced or k in previous_names]
            name = self.meta['releaseId']+'-weekly-'+kind+'-'+uuid.uuid4().hex[:8]
            created = self.cf.create_change_set(StackName=stack, ChangeSetName=name, ChangeSetType='UPDATE', TemplateBody=json.dumps(template), Parameters=params,
                Capabilities=['CAPABILITY_IAM','CAPABILITY_AUTO_EXPAND'], Description='Verified fresh-double-opt-in audience only; future schedules, no campaign invocation')
            self.cf.get_waiter('change_set_create_complete').wait(StackName=stack, ChangeSetName=created['Id'])
            result = self.cf.describe_change_set(StackName=stack, ChangeSetName=created['Id']); inspect_changes(result.get('Changes', []))
            require(not result.get('NextToken'), 'Paginated weekly change set; STOP')
            prepared.append({'stack':stack,'id':created['Id'],'name':name,'kind':kind,'Changes':result.get('Changes',[])})
        self.state['weeklyPrepared'] = prepared; self.state['weeklyNotBefore'] = next_monday.isoformat(); self.state['websiteShaOwnerVerified'] = website_sha
        self.state['weeklySchedules'] = [{'Name': self.meta['stack']+'-weekly', 'GroupName':'default', 'cron':'cron(10 9 ? * MON *)', 'kind':'weekly'},
            {'Name':companion+'-daily-publications', 'GroupName':'default', 'cron':'cron(0 9 * * ? *)', 'kind':'sanity-discovery'}]
        self.state['discoveryFunction'] = discovery['FunctionName']; self.save()
        (HERE/'weekly-change-set-review.json').write_text(json.dumps(prepared, indent=2, default=str)+'\n')
        print('REVIEW BOTH new weekly change sets. Enrollment/delivery remain durably OFF. No schedule changed or function invoked.')
    def execute_weekly(self, approved):
        require(self.activation_allowed(), 'Private repair requires verified tests and separate public activation approval')
        require(approved, 'Both exact weekly change sets require explicit review and --approve')
        self.paused(); self.schedules_off(); self.weekly_preflight()
        prepared = self.state.get('weeklyPrepared', [])
        require(len(prepared) == 2 and not self.state.get('weeklyExecutionStarted'), 'Missing plan or previous uncertain execution; inspect instead of retrying')
        start = datetime.datetime.fromisoformat(self.state['weeklyNotBefore'])
        require(start > datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(minutes=30), 'Future weekly start expired; create fresh reviewed plan')
        for item in prepared:
            require(item['name'].startswith(self.meta['releaseId']+'-weekly-'), 'Wrong change set')
            result = self.cf.describe_change_set(StackName=item['stack'], ChangeSetName=item['id']); inspect_changes(result.get('Changes', []))
            require(result['ExecutionStatus'] == 'AVAILABLE' and not result.get('NextToken'), 'Weekly change set no longer available')
        self.state['weeklyExecutionStarted'] = True; self.save()
        for item in prepared:
            self.cf.execute_change_set(StackName=item['stack'], ChangeSetName=item['id'])
            self.cf.get_waiter('stack_update_complete').wait(StackName=item['stack'])
        expected = base64.b64encode(bytes.fromhex(self.meta['runtimeSha256'])).decode()
        for name in [self.resources[k] for k in ['ApiFunction','PlannerFunction','WorkerFunction','FeedbackFunction','ContactSyncFunction']] + [self.state['discoveryFunction']]:
            cfg = self.client('lambda').get_function_configuration(FunctionName=name)
            require(cfg['CodeSha256'] == expected and cfg['Environment']['Variables']['DELIVERY_ENABLED'] == 'true', 'Weekly runtime/readback mismatch; CONTROL stays OFF')
        for schedule in self.state['weeklySchedules']:
            actual = self.client('scheduler').get_schedule(Name=schedule['Name'], GroupName=schedule['GroupName'])
            require(actual['State'] == 'ENABLED' and actual['ScheduleExpression'] == schedule['cron'] and actual['ScheduleExpressionTimezone'] == 'UTC' and
                actual['FlexibleTimeWindow'] == {'Mode':'OFF'} and json.loads(actual['Target']['Input']) == {'kind':schedule['kind']}, 'Schedule readback mismatch; CONTROL stays OFF')
        self.weekly_preflight()
        approval, values = audience.approval(self.control())
        self.table.update_item(Key={'pk':'CONTROL'}, UpdateExpression='SET deliveryEnabled=:yes, registrationEnabled=:yes, confirmationEnabled=:yes',
            ConditionExpression='attribute_exists(pk) AND deliveryEnabled=:no AND registrationEnabled=:no AND confirmationEnabled=:no AND legacyRetired=:yes AND complianceApproved=:yes AND ' + approval + ' AND contentSourceApproved=:yes AND sanityPublishedStateApproved=:yes AND contentStartAt=:cutover',
            ExpressionAttributeValues={':yes':True,':no':False,':cutover':1792875600000,**values})
        require(self.control().get('deliveryEnabled') is True, 'Final CONTROL readback failed')
        self.state['weeklyActivated'] = True; self.save()
        print('WEEKLY ACTIVATED for fresh confirmed AWS consent only. First weekly start: '+self.state['weeklyNotBefore']+'. No campaign invoked/replayed; 72 legacy article exclusions and max 10 articles retained.')
    def stop_weekly(self, approved):
        require(approved, 'Emergency weekly pause requires --approve')
        # Gate first. Even a later Scheduler permission error leaves delivery closed.
        self.table.update_item(Key={'pk':'CONTROL'}, UpdateExpression='SET deliveryEnabled=:no', ConditionExpression='attribute_exists(pk)', ExpressionAttributeValues={':no':False})
        require(self.control().get('deliveryEnabled') is False, 'Delivery close readback failed')
        for schedule in self.state.get('weeklySchedules', []):
            current = self.client('scheduler').get_schedule(Name=schedule['Name'], GroupName=schedule['GroupName'])
            permitted = ['Name','GroupName','ScheduleExpression','ScheduleExpressionTimezone','StartDate','EndDate','FlexibleTimeWindow','Target','Description','KmsKeyArn','ActionAfterCompletion']
            args = {k:current[k] for k in permitted if k in current}; args['State'] = 'DISABLED'
            self.client('scheduler').update_schedule(**args)
        self.schedules_off(); self.state['weeklyActivated'] = False; self.save()
        print('DELIVERY AND SCHEDULES CLOSED. Enrollment/confirmation, unsubscribe, feedback, records, claims and checkpoints preserved. Never roll back to a runtime without the fresh-consent guard.')

def main():
    p = argparse.ArgumentParser(); p.add_argument('command', choices=['initialize-audience', 'prepare', 'execute', 'readiness', 'arm-test', 'signup-test', 'verify-confirmation', 'feedback-test', 'unsubscribe-test', 'finish-test', 'close', 'open-public', 'support-optout', 'prepare-weekly', 'execute-weekly', 'stop-weekly'])
    p.add_argument('--phase', choices=['disabled', 'test', 'public'], default='disabled'); p.add_argument('--approve', action='store_true')
    p.add_argument('--support-verified', action='store_true'); p.add_argument('--historical-feedback-reconciled', action='store_true')
    p.add_argument('--email'); p.add_argument('--evidence-sha256')
    p.add_argument('--website-sha')
    a = p.parse_args(); r = Release()
    if a.command == 'initialize-audience': r.initialize_audience(a.approve)
    elif a.command == 'prepare': r.prepare(a.phase, a.approve)
    elif a.command == 'execute': r.execute(a.phase, a.approve)
    elif a.command == 'readiness': r.readiness(a.support_verified, a.historical_feedback_reconciled)
    elif a.command in ['arm-test', 'open-public']: r.arm(a.command == 'open-public', a.approve)
    elif a.command == 'signup-test': r.signup(a.approve)
    elif a.command == 'verify-confirmation': r.confirmed(a.approve)
    elif a.command == 'feedback-test': r.feedback_test(a.approve)
    elif a.command == 'unsubscribe-test': r.unsubscribe(a.approve)
    elif a.command == 'finish-test': r.finish()
    elif a.command == 'close': r.close(a.approve)
    elif a.command == 'support-optout': r.support_optout(a.email, a.evidence_sha256, a.approve)
    elif a.command == 'prepare-weekly': r.prepare_weekly(a.website_sha, a.approve)
    elif a.command == 'execute-weekly': r.execute_weekly(a.approve)
    elif a.command == 'stop-weekly': r.stop_weekly(a.approve)
if __name__ == '__main__':
    try: main()
    except Exception as error:
        # Never echo SDK errors, request data, capabilities or secret values.
        print('STOP: ' + (str(error) if isinstance(error, RuntimeError) else type(error).__name__ + '; inspect privately, do not retry an uncertain send'))
        raise SystemExit(1)
