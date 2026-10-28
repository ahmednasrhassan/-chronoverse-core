"""Synthetic local fixtures only; no AWS and no real checkpoint/receipt writes."""
import ast
import copy
import contextlib
import importlib.util
import io
import json
import pathlib
import tempfile
import types
import unittest
import sys
from unittest.mock import patch

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[2]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


m = load('finalizer', HERE.parent / 'ops/finalize_deployment.py')
LAUNCHER = REPO / 'services/newsletter/scripts/cloudshell-confirmation-fix.py'
launcher = load('reviewed_launcher', LAUNCHER)
SECRET = 'SYNTHETIC_PRIVATE_TOKEN_SUBSCRIBER'


class PostExecutionAssertions(unittest.TestCase):
    """Execute the unchanged real post-wait AST and route checks at real lines.

    CloudFormation/private-configuration checks are stubbed, not reverified.
    This isolates which assertions can emit the observed failure signature.
    """
    def run_tail(self, *, uri_drift=False, default_drift=False, source_drift=False,
                 template_failure=False, foreign=False):
        tree = ast.parse(LAUNCHER.read_text())
        node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'deploy')
        start = next(i for i, n in enumerate(node.body) if isinstance(n, ast.With) and
            ast.unparse(n.items[0].context_expr) == "failure_stage('stack-update-wait')") + 1
        node.body = node.body[start:]
        arn = 'arn:aws:lambda:eu-north-1:957261948953:function:chronoverse-newsletter-v2-api'
        integration = {'IntegrationId': 'example', 'IntegrationUri': arn,
            'IntegrationType': 'AWS_PROXY', 'IntegrationMethod': 'POST', 'PayloadFormatVersion': '2.0'}
        routes = [{'RouteId': str(i), 'RouteKey': key, 'Target': 'integrations/example',
            'AuthorizationType': 'AWS_IAM' if key in launcher.PRIVATE_ROUTES else 'NONE'}
            for i, key in enumerate(sorted(launcher.ROUTES))]
        client = types.SimpleNamespace(get_paginator=lambda _: types.SimpleNamespace(
            paginate=lambda **_: [{'Items': [integration]}]))
        r = types.SimpleNamespace(client=lambda _: client, routes=lambda: routes,
            resources={'HttpApi': 'example', 'ApiFunction': 'chronoverse-newsletter-v2-api'},
            meta={'region': 'eu-north-1', 'account': '957261948953'})
        before = launcher.route_configuration(r)
        if uri_drift:
            integration['IntegrationUri'] = 'arn:aws:apigateway:eu-north-1:lambda:path/2015-03-31/functions/' + arn + '/invocations'
        if default_drift:
            integration['TimeoutInMillis'] = 30000
        if foreign:
            integration['IntegrationUri'] = arn + ':foreign-alias'
        source = {'expected': True}
        state = {'executionStarted': True}
        saves = []
        def processed(*_):
            if template_failure:
                with launcher.failure_stage('processed-template'):
                    launcher.require(False, 'synthetic template mismatch')
        namespace = dict(launcher.__dict__)
        namespace.update(api_before=before, template=source, processed={}, code={},
            verify_private=lambda *_: None, inspect_templates=processed,
            get_template=lambda *_: {'expected': False} if source_drift else source)
        exec(compile(ast.Module(body=[node], type_ignores=[]), str(LAUNCHER), 'exec'), namespace)
        try:
            namespace['deploy'](r, None, {'runtimeSha256': m.PATCHED}, state, lambda: saves.append(copy.deepcopy(state)))
            return state, saves, None
        except RuntimeError as error:
            return state, saves, launcher.failure_details(error)

    def assert_deployment_failure(self, result):
        state, saves, failure = result
        self.assertEqual(state, {'executionStarted': True})
        self.assertEqual(saves, [])
        self.assertEqual(failure, {'Stage': 'deployment', 'Class': 'RuntimeError',
            'Source': 'launcher', 'SourceLine': 15})

    def test_semantically_valid_bare_to_wrapped_uri_reproduces_failure(self):
        self.assert_deployment_failure(self.run_tail(uri_drift=True))

    def test_added_default_field_also_reproduces_failure(self):
        self.assert_deployment_failure(self.run_tail(default_drift=True))

    def test_source_equality_has_identical_diagnostic_so_historical_caller_unknown(self):
        self.assert_deployment_failure(self.run_tail(source_drift=True))

    def test_unchanged_postconditions_save_deployed_true(self):
        state, saves, failure = self.run_tail()
        self.assertIsNone(failure)
        self.assertIs(state['deployed'], True)
        self.assertEqual(saves, [state])

    def test_foreign_alias_and_processed_failure_have_different_stages(self):
        self.assertEqual(self.run_tail(foreign=True)[2]['Stage'], 'live-routes')
        self.assertEqual(self.run_tail(template_failure=True)[2]['Stage'], 'processed-template')


class Fixture:
    def __init__(self, root):
        self.root = root
        for name in (m.WORK, m.ORIGINAL, m.PATCH):
            (root / name).mkdir()
        self.checkpoint = root / m.WORK / '.confirmation-fix-state.json'
        self.state = {'patchId': m.PATCH, 'originalDirectory': str(root / m.ORIGINAL),
            'executionStarted': True, 'changeSetId': 'arn:aws:cloudformation:eu-north-1:957261948953:changeSet/synthetic/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            'confirmationClaim': SECRET, 'token': SECRET}
        self.save_state()
        (root / m.PATCH / '.confirmation-fix-state.json').write_text(json.dumps({'claim': SECRET}))
        (root / m.ORIGINAL / '.cloudshell-release-state.json').write_text(json.dumps({'subscriber': SECRET}))
        (root / m.WORK / 'deploy-confirmation-fix.py').write_bytes(LAUNCHER.read_bytes())
        (root / m.ORIGINAL / 'SHA256SUMS').write_bytes((REPO / 'services/newsletter/test/fixtures/confirmation/original-manifest.txt').read_bytes())
        raw = (REPO / 'services/newsletter/test/fixtures/confirmation/working-manifest.txt').read_bytes()
        raw = raw.replace(b'887dfaddfb2ba9a2834c4fafa87b8a90b9a8852f78583d2fd7069d5bef4ec4e6', m.SOURCE.encode())
        (root / m.WORK / 'SHA256SUMS').write_bytes(raw)
        self.evidence = root / 'saved-synthetic-evidence.json'
        self.report = {
            'Stack': {'Status': 'UPDATE_COMPLETE', 'StackChangeSetMatchesCheckpoint': True,
                'LastUpdatedTime': '2026-10-28 10:00:00+00:00'},
            'RecordedChangeSet': {'ExecutionStatus': 'EXECUTE_COMPLETE', 'StackIdentityMatches': True,
                'IdMatchesCheckpoint': True, 'StackChangeSetIdMatchesCheckpoint': True},
            'Metadata': {'WorkingCheckpoint': {'Exists': True, 'PatchIdMatches': True,
                'OriginalDirectoryMatches': True, 'executionStarted': True, 'deployed': 'ABSENT_OR_WRONG_TYPE'},
                'Receipt': {'Exists': False}, 'CorrectedLauncherMatches': True,
                'OriginalManifestMatches': True, 'WorkingManifestMatches': True},
            'StackUnchangedDuringReads': True, 'WatchedFilesUnchanged': True,
            'Templates': {**{k: True for k in ('OriginalTemplateMatchesPinnedOverlay',
                'ApiImmutableLocationMatches', 'ProcessedCodeMatchesOriginal',
                'ProcessedExceptApiCodeMatchesLocalReference', 'ApiBodyMatchesLocalReference')},
                'ProcessedResourceCount': 50, 'OriginalCanonicalSha256': 'a' * 64,
                'ProcessedCanonicalSha256': 'b' * 64, 'OriginallyApprovedObjectVersionIndependentlyRecovered': False},
            'Lambdas': {name: {'CodeSha256Hex': m.PATCHED if name == 'ApiFunction' else m.BASE,
                'Runtime': 'PATCHED' if name == 'ApiFunction' else 'BASE', 'MatchesExpected': True,
                'State': 'Active', 'LastUpdateStatus': 'Successful', 'UnqualifiedLatest': True} for name in m.FUNCTIONS},
            'HttpApi': {'ExactlyElevenExpectedRoutes': True, 'Routes': [
                {'Route': route, 'AuthorizationMatches': True, 'ExactUnqualifiedTargetMatches': True,
                    'ProxyConfigurationMatches': True, 'UriForm': 'BARE'} for route in sorted(m.ROUTES)]},
            'Control': {gate: False for gate in m.GATES},
            'Schedules': {'Count': 2, 'ExactlyTwoDisabled': True, 'States': ['DISABLED', 'DISABLED']},
            'IgnoredPrivateField': SECRET}
        self.save_report()

    def save_state(self):
        self.checkpoint.write_bytes(m.encode(self.state))

    def save_report(self):
        self.evidence.write_bytes(m.encode(self.report))

    def snapshot(self):
        return {name: (self.root / name).read_bytes() for name in m.WATCH}


class FinalizationGuards(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.f = Fixture(pathlib.Path(self.temporary.name))
        self.receipt = self.f.root / m.WORK / 'DEPLOYMENT-RECEIPT.json'

    def review(self):
        return m.review(self.f.evidence, self.f.root)

    def test_default_review_is_read_only_and_redacts_checkpoint_and_extra_evidence(self):
        before = {p: p.read_bytes() for p in self.f.root.rglob('*') if p.is_file()}
        plan, payload = self.review()
        self.assertEqual(before, {p: p.read_bytes() for p in self.f.root.rglob('*') if p.is_file()})
        self.assertFalse(self.receipt.exists())
        self.assertNotIn(SECRET, m.encode(plan).decode())
        self.assertNotIn(self.f.state['changeSetId'], payload.decode())
        self.assertEqual(plan['checkpointWrites'], 0)
        self.assertFalse(plan['receipt']['executedChangeSetTemplateRecovered'])
        self.assertEqual(plan['receipt']['confirmationEndToEnd'], 'NOT_RUN')
        self.assertEqual(plan['receipt']['unsubscribeEndToEnd'], 'NOT_RUN')

    def test_fixture_only_approved_create_is_idempotent_and_all_checkpoints_immutable(self):
        before = self.f.snapshot()
        plan, payload = self.review()
        self.assertEqual(m.finalize(self.f.evidence, plan['planSha256'], self.f.root), 'RECEIPT_CREATED_CHECKPOINTS_UNCHANGED')
        self.assertEqual(self.receipt.read_bytes(), payload)
        self.assertEqual(m.finalize(self.f.evidence, plan['planSha256'], self.f.root), 'IDENTICAL_RECEIPT_NO_OP')
        self.assertEqual(before, self.f.snapshot())

    def test_wrong_or_missing_approval_creates_nothing(self):
        for approved in (None, '', '0' * 64):
            with self.subTest(approved=approved), self.assertRaises(m.Stop):
                m.finalize(self.f.evidence, approved, self.f.root)
        self.assertFalse(self.receipt.exists())

    def test_changed_checkpoint_or_evidence_invalidates_exact_approval(self):
        plan, _ = self.review()
        self.f.state['retainedHistoricalMetadata'] = 'new'
        self.f.save_state()
        with self.assertRaises(m.Stop):
            m.finalize(self.f.evidence, plan['planSha256'], self.f.root)
        fresh, _ = self.review()
        self.f.report['IgnoredPrivateField'] = 'changed'
        self.f.save_report()
        with self.assertRaises(m.Stop):
            m.finalize(self.f.evidence, fresh['planSha256'], self.f.root)
        self.assertFalse(self.receipt.exists())

    def test_uncertain_or_partial_existing_receipt_never_overwritten(self):
        for value in (b'{', b'', b'{"deployment":"VERIFIED"}'):
            with self.subTest(value=value):
                self.receipt.write_bytes(value)
                with self.assertRaises(m.Stop):
                    self.review()
                self.assertEqual(self.receipt.read_bytes(), value)

    def test_exclusive_create_race_never_overwrites_another_receipt(self):
        plan, _ = self.review()
        real_open = m.os.open
        def competing_open(path, flags, mode):
            self.receipt.write_bytes(b'uncertain competing receipt')
            return real_open(path, flags, mode)
        with patch.object(m.os, 'open', competing_open), self.assertRaises(FileExistsError):
            m.finalize(self.f.evidence, plan['planSha256'], self.f.root)
        self.assertEqual(self.receipt.read_bytes(), b'uncertain competing receipt')

    def test_malformed_enabled_or_missing_gates_schedules_and_foreign_routes_stop(self):
        cases = [(['Control', 'registrationEnabled'], v) for v in (True, 0, 'false', None)]
        cases += [(['Schedules', 'States'], ['DISABLED', 'ENABLED']),
            (['Schedules', 'Count'], True),
            (['HttpApi', 'Routes', 0, 'ExactUnqualifiedTargetMatches'], False),
            (['HttpApi', 'Routes', 0, 'AuthorizationMatches'], 'true'),
            (['Lambdas', 'ApiFunction', 'UnqualifiedLatest'], False),
            (['Templates', 'ProcessedExceptApiCodeMatchesLocalReference'], False),
            (['Stack', 'LastUpdatedTime'], SECRET),
            (['RecordedChangeSet', 'IdMatchesCheckpoint'], False),
            (['RecordedChangeSet', 'ExecutionStatus'], 'AVAILABLE')]
        original = copy.deepcopy(self.f.report)
        for path, value in cases:
            with self.subTest(path=path, value=value):
                self.f.report = copy.deepcopy(original)
                obj = self.f.report
                for key in path[:-1]: obj = obj[key]
                obj[path[-1]] = value; self.f.save_report()
                with self.assertRaises(m.Stop): self.review()
                self.assertFalse(self.receipt.exists())

    def test_wrong_checkpoint_identity_flags_and_changed_source_stop(self):
        original = copy.deepcopy(self.f.state)
        for key, value in [('patchId', 'other'), ('originalDirectory', 'other'),
            ('executionStarted', 1), ('deployed', True), ('deployed', False), ('changeSetId', 'foreign')]:
            with self.subTest(key=key, value=value):
                self.f.state = {**original, key: value}; self.f.save_state()
                with self.assertRaises(m.Stop): self.review()
        self.f.state = original; self.f.save_state()
        (self.f.root / m.WORK / 'deploy-confirmation-fix.py').write_text('changed')
        with self.assertRaises(m.Stop): self.review()
        self.assertFalse(self.receipt.exists())

    def test_interrupted_receipt_write_requires_manual_review_preserves_checkpoints(self):
        before = self.f.snapshot()
        plan, _ = self.review()
        with patch.object(m.os, 'fsync', side_effect=OSError('synthetic interruption')):
            with self.assertRaises(OSError): m.finalize(self.f.evidence, plan['planSha256'], self.f.root)
        data = self.receipt.read_bytes()
        self.assertEqual(before, self.f.snapshot())
        # A fully flushed matching receipt is safe to recognize; partial data
        # would instead hit the existing-receipt-conflict guard above.
        self.assertEqual(data, self.review()[1])

    def test_deployed_wrong_type_preserved_and_duplicate_json_rejected(self):
        self.f.state['deployed'] = 'uncertain'; self.f.save_state()
        before = self.f.snapshot()
        plan, _ = self.review()
        m.finalize(self.f.evidence, plan['planSha256'], self.f.root)
        self.assertEqual(before, self.f.snapshot())
        with self.assertRaises(m.Stop): m.decode(b'{"gate":false,"gate":true}')

    def test_file_not_found_diagnostic_does_not_leak_private_error_message(self):
        before = self.f.snapshot()
        output = io.StringIO()
        with patch.object(sys, 'argv', ['finalize_deployment.py', '--saved-evidence', 'unused']), \
            patch.object(m, 'review', side_effect=FileNotFoundError(SECRET)), \
            contextlib.redirect_stdout(output), self.assertRaises(SystemExit) as stopped:
            m.main()
        self.assertEqual(stopped.exception.code, 1)
        data = json.loads(output.getvalue())
        self.assertEqual(data['Class'], 'FileNotFoundError')
        self.assertTrue(data['STOP'])
        self.assertNotIn(SECRET, output.getvalue())
        self.assertEqual(before, self.f.snapshot())
        self.assertFalse(self.receipt.exists())

    def test_drift_on_second_review_stops_before_receipt_creation(self):
        plan, _ = self.review()
        real_review = m.review
        calls = []
        def racing_review(*args):
            calls.append(True)
            if len(calls) == 2:
                self.f.state['uncertainConcurrentChange'] = True
                self.f.save_state()
            return real_review(*args)
        with patch.object(m, 'review', racing_review), self.assertRaises(m.Stop):
            m.finalize(self.f.evidence, plan['planSha256'], self.f.root)
        self.assertFalse(self.receipt.exists())


if __name__ == '__main__':
    unittest.main()
