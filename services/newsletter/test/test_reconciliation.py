"""Offline synthetic post-update reconciliation; no network or actual checkpoints."""
import base64, copy, datetime, importlib.util, json, pathlib, tempfile, types, unittest


class ClientError(Exception):
    def __init__(self, response, operation):
        self.response = response
        super().__init__(response['Error']['Message'])

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
spec = importlib.util.spec_from_file_location('post_execution_reconciliation', HERE.parent / 'ops/reconcile_read_only.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
SECRET = 'PRIVATE_TOKEN_SUBSCRIBER_SDK_RESPONSE'


class Fixture:
    def __init__(self, root):
        self.root = root; self.mode = None; self.effects = []; self.requests = []
        original = root / m.ORIGINAL_ID; original.mkdir()
        work = root / 'confirmation-launcher-59d8e91cf905'; work.mkdir()
        prior = root / m.PATCH_ID; prior.mkdir()
        packaged = ROOT / 'services/newsletter/test/fixtures/confirmation'
        for name in ('SHA256SUMS', 'main-template.json', 'release.json'):
            (original / name).write_bytes((packaged / {'SHA256SUMS':'original-manifest.txt','main-template.json':'original-template.json','release.json':'original-release-metadata.json'}[name]).read_bytes())
        (work / 'deploy-confirmation-fix.py').write_bytes((ROOT / 'services/newsletter/scripts/cloudshell-confirmation-fix.py').read_bytes())
        manifest = (ROOT / 'services/newsletter/test/fixtures/confirmation/working-manifest.txt').read_bytes()
        manifest = manifest.replace(b'887dfaddfb2ba9a2834c4fafa87b8a90b9a8852f78583d2fd7069d5bef4ec4e6', m.SOURCE.encode())
        (work / 'SHA256SUMS').write_bytes(manifest)
        self.identifier = 'arn:aws:cloudformation:eu-north-1:957261948953:changeSet/confirmation-post-fix-synthetic/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
        self.state = {'patchId': m.PATCH_ID, 'originalDirectory': str(original.resolve()), 'executionStarted': True, 'deployed': False,
            'changeSetId': self.identifier, 'changeSetName': 'confirmation-post-fix-synthetic', 'token': SECRET, 'email': SECRET}
        for folder in (prior, work): (folder / '.confirmation-fix-state.json').write_text(json.dumps(self.state))
        (original / '.cloudshell-release-state.json').write_text(json.dumps({'releaseId': m.ORIGINAL_ID, 'privateSubscriber': SECRET}))
        self.sentinel = root / 'unchanged'; self.sentinel.write_text('preserve')
        self.names = {name: 'synthetic-' + name for name in (*m.FUNCTIONS, 'Ledger')}; self.names['HttpApi'] = m.API
        self.stack = {'StackId': 'synthetic-stack', 'StackStatus': 'UPDATE_COMPLETE', 'ChangeSetId': self.identifier,
            'LastUpdatedTime': datetime.datetime(2026, 10, 28, 10, tzinfo=datetime.timezone.utc)}
        self.source = json.loads((original / 'main-template.json').read_bytes())
        self.processed = json.loads((ROOT / 'services/newsletter/test/fixtures/confirmation/before-processed.json').read_bytes())
        uri = {'Bucket': json.loads((original / 'release.json').read_bytes())['bucket'],
            'Key': 'newsletter-confirmation-fixes/' + m.PATCH_ID + '/' + m.PATCHED + '/runtime.zip', 'Version': 'synthetic-version'}
        self.source['Resources']['ApiFunction']['Properties']['CodeUri'] = uri
        self.source['Resources']['HttpApi']['Properties']['Auth'] = {'EnableIamAuthorizer': True}
        for name in ('subscribe', 'registerPage', 'registerAction'):
            self.source['Resources']['ApiFunction']['Properties']['Events'][name]['Properties']['Auth'] = {'Authorizer': 'AWS_IAM'}
        self.processed['Resources']['ApiFunction']['Properties']['Code'] = {'S3Bucket': uri['Bucket'], 'S3Key': uri['Key'], 'S3ObjectVersion': uri['Version']}
        body = self.processed['Resources']['HttpApi']['Properties']['Body']
        body['components'] = {'securitySchemes': {'AWS_IAM': {'type': 'apiKey', 'name': 'Authorization', 'in': 'header', 'x-amazon-apigateway-authtype': 'awsSigv4'}}}
        for path, method in [('/register', 'get'), ('/register', 'post'), ('/subscribe', 'post')]: body['paths'][path][method]['security'] = [{'AWS_IAM': []}]
        self.callbacks = []

    def factory(self, **kwargs):
        return types.SimpleNamespace(events=types.SimpleNamespace(register=lambda name, callback: self.callbacks.append((name, callback))), client=self.client)

    def client(self, service):
        fixture = self
        class Client:
            def __getattr__(self, operation):
                def read(**params):
                    model = types.SimpleNamespace(name=''.join(w.title() for w in operation.split('_')), service_model=types.SimpleNamespace(service_name=service))
                    request = copy.deepcopy(params)
                    if service == 'dynamodb' and fixture.mode == 'subscriber-read': request['Key'] = {'pk': {'S': 'SUB#' + SECRET}}
                    if service == 'dynamodb' and fixture.mode == 'mutation': model.name = 'UpdateItem'
                    for name, callback in fixture.callbacks:
                        callback(model=model, params=request if name.startswith('before-parameter') else {'body': SECRET})
                    fixture.requests.append((service, operation))
                    return fixture.response(service, operation, params)
                return read
        return Client()

    def response(self, service, operation, params):
        if service == 'sts':
            if self.mode == 'file-write': self.sentinel.write_text(SECRET)
            return {'Account': 'wrong' if self.mode == 'wrong-account' else m.ACCOUNT}
        if service == 'cloudformation':
            if operation == 'describe_stacks': return {'Stacks': [copy.deepcopy(self.stack)]}
            if operation == 'list_stack_resources':
                return {'StackResourceSummaries': [{'LogicalResourceId': k, 'PhysicalResourceId': v} for k, v in self.names.items()]}
            if operation == 'describe_stack_events':
                events = []
                for minutes, logical, kind, status in [(3, m.STACK, 'AWS::CloudFormation::Stack', 'UPDATE_COMPLETE'),
                    (2, 'HttpApi', 'AWS::ApiGatewayV2::Api', 'UPDATE_COMPLETE'),
                    (1, 'ApiFunction', 'AWS::Lambda::Function', 'UPDATE_COMPLETE'),
                    (0, m.STACK, 'AWS::CloudFormation::Stack', 'UPDATE_IN_PROGRESS')]:
                    events.append({'Timestamp': self.stack['LastUpdatedTime'] + datetime.timedelta(minutes=minutes),
                        'LogicalResourceId': logical, 'ResourceType': kind, 'ResourceStatus': status,
                        'ResourceStatusReason': SECRET, 'ResourceProperties': SECRET, 'ClientRequestToken': SECRET})
                return {'StackEvents': events}
            if operation == 'describe_change_set':
                raise ClientError({'Error': {'Code': 'ChangeSetNotFoundException', 'Message': SECRET}}, 'DescribeChangeSet')
            if operation == 'get_template': return {'TemplateBody': copy.deepcopy(self.source if params['TemplateStage'] == 'Original' else self.processed)}
        if service == 'lambda':
            logical = next(k for k, v in self.names.items() if v == params['FunctionName'])
            expected = m.PATCHED if logical == 'ApiFunction' else m.BASE
            return {'CodeSha256': base64.b64encode(bytes.fromhex(expected)).decode(), 'State': 'Active', 'LastUpdateStatus': 'Successful', 'Version': '$LATEST',
                'Environment': {'Variables': {'DELIVERY_ENABLED': 'false', 'SECRET': SECRET}}}
        if service == 'apigatewayv2':
            if operation == 'get_integrations':
                arn = 'arn:aws:lambda:' + m.REGION + ':' + m.ACCOUNT + ':function:' + self.names['ApiFunction']
                uri = 'arn:aws:apigateway:' + m.REGION + ':lambda:path/2015-03-31/functions/' + arn + '/invocations'
                if self.mode == 'alias': uri = uri.replace('/invocations', ':foreign/invocations')
                return {'Items': [{'IntegrationId': 'synthetic', 'IntegrationType': 'AWS_PROXY', 'IntegrationMethod': 'POST', 'PayloadFormatVersion': '2.0', 'IntegrationUri': uri}]}
            return {'Items': [{'RouteKey': k, 'AuthorizationType': 'AWS_IAM' if k in m.PRIVATE else 'NONE', 'Target': 'integrations/synthetic'} for k in sorted(m.ROUTES)]}
        if service == 'dynamodb': return {'Item': {k: {'BOOL': k == 'registrationEnabled' and self.mode == 'enabled-gate'} for k in m.GATES}}
        if service == 'scheduler': return {'Schedules': [{'Name': 'chronoverse-newsletter-weekly', 'State': 'DISABLED'},
            {'Name': 'chronoverse-newsletter-discovery', 'State': 'ENABLED' if self.mode == 'enabled-schedule' else 'DISABLED'}]}
        self.effects.append((service, operation)); raise AssertionError('Unexpected API')


class ReconciliationTests(unittest.TestCase):
    def run_fixture(self, mode=None, change=None):
        with tempfile.TemporaryDirectory() as directory:
            f = Fixture(pathlib.Path(directory)); f.mode = mode
            if change: change(f)
            before = {p: p.read_bytes() for p in f.root.rglob('*') if p.is_file()}
            result = m.reconcile(f.root, f.factory)
            self.assertNotIn(SECRET, json.dumps(result))
            self.assertFalse(f.effects)
            self.assertEqual(before, {p: p.read_bytes() for p in f.root.rglob('*') if p.is_file()})
            return result

    def test_successful_update_missing_receipt_and_missing_changeset_are_not_redeployment(self):
        value = self.run_fixture()
        self.assertNotIn('Error', value)
        self.assertEqual(value['RecordedChangeSet']['Error']['AwsErrorCode'], 'ChangeSetNotFoundException')
        self.assertTrue(value['Events']['StackUpdateCompleteEventSeen'])
        self.assertTrue(value['Events']['LatestUpdateStartEventSeen'])
        self.assertEqual(len(value['Events']['Events']), 4)
        self.assertTrue(value['Templates']['OriginalTemplateMatchesPinnedOverlay'])
        self.assertTrue(value['Templates']['ProcessedExceptApiCodeMatchesLocalReference'])
        self.assertTrue(value['Templates']['ApiBodyMatchesLocalReference'])
        self.assertTrue(all(v['MatchesExpected'] for v in value['Lambdas'].values()))
        self.assertTrue(all(v['ExactUnqualifiedTargetMatches'] and v['AuthorizationMatches'] for v in value['HttpApi']['Routes']))
        self.assertFalse(any(value['Control'].values()))
        self.assertTrue(value['Schedules']['ExactlyTwoDisabled'])
        self.assertFalse(value['Metadata']['Receipt']['Exists'])
        self.assertTrue(value['Metadata']['WorkingCheckpoint']['executionStarted'])
        self.assertFalse(value['Metadata']['WorkingCheckpoint']['deployed'])
        self.assertTrue(value['WatchedFilesUnchanged'])

    def test_foreign_alias_gate_schedule_and_template_drift_are_reported_without_writes(self):
        self.assertTrue(all(not r['ExactUnqualifiedTargetMatches'] for r in self.run_fixture('alias')['HttpApi']['Routes']))
        self.assertTrue(self.run_fixture('enabled-gate')['Control']['registrationEnabled'])
        self.assertFalse(self.run_fixture('enabled-schedule')['Schedules']['ExactlyTwoDisabled'])
        value = self.run_fixture(change=lambda f: f.processed['Resources']['Ledger'].update(DeletionPolicy='Delete'))
        self.assertFalse(value['Templates']['ProcessedExceptApiCodeMatchesLocalReference'])

    def test_sdk_mutation_and_subscriber_reads_are_rejected(self):
        for mode in ('mutation', 'subscriber-read'):
            value = self.run_fixture(mode)
            self.assertEqual(value['Control']['Error']['Class'], 'RuntimeError')

    def test_filesystem_writes_are_rejected(self):
        self.assertEqual(self.run_fixture('file-write')['Error']['Class'], 'RuntimeError')

    def test_wrong_account_stops_before_stack_reads(self):
        value = self.run_fixture('wrong-account')
        self.assertEqual(value['ApiCalls'], ['sts.get_caller_identity'])
        self.assertEqual(value['Error']['Class'], 'RuntimeError')

    def test_resource_route_integration_and_schedule_pagination_is_complete(self):
        def paginate(f):
            response = f.response
            def paginated(service, operation, params):
                value = response(service, operation, params)
                keys = {('cloudformation', 'list_stack_resources'): 'StackResourceSummaries',
                    ('apigatewayv2', 'get_routes'): 'Items', ('apigatewayv2', 'get_integrations'): 'Items',
                    ('scheduler', 'list_schedules'): 'Schedules'}
                key = keys.get((service, operation))
                if not key: return value
                records = value[key]
                return {key: records[1:]} if params.get('NextToken') else {key: records[:1], 'NextToken': 'synthetic-page'}
            f.response = paginated
        value = self.run_fixture(change=paginate)
        self.assertTrue(all(v['MatchesExpected'] for v in value['Lambdas'].values()))
        self.assertTrue(value['HttpApi']['ExactlyElevenExpectedRoutes'])
        self.assertTrue(value['Schedules']['ExactlyTwoDisabled'])


if __name__ == '__main__': unittest.main()
