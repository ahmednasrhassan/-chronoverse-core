"""Offline preview tests reuse synthetic fixtures; never read real checkpoints."""
import contextlib
import importlib.util
import io
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch

from test_finalization import Fixture, SECRET

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('safe_preview', HERE.parent / 'ops/preview_deployment.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class PreviewTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.f = Fixture(pathlib.Path(self.temporary.name))
        self.f.report['RecordedChangeSet']['Status'] = 'CREATE_COMPLETE'

    def execute(self):
        self.f.save_report()
        before = {p: p.read_bytes() for p in self.f.root.rglob('*') if p.is_file()}
        try:
            return m.preview(self.f.evidence, self.f.root)
        finally:
            self.assertEqual(before, {p: p.read_bytes() for p in self.f.root.rglob('*') if p.is_file()})

    def test_exact_saved_ids_allow_sanitized_read_only_preview(self):
        for section in ('RecordedChangeSet', 'Stack'):
            self.f.report[section]['ChangeSetId'] = self.f.state['changeSetId']
        plan = self.execute()
        self.assertTrue(plan['evidenceBindingVerified'])
        self.assertEqual(plan['mode'], 'READ_ONLY_PREVIEW')
        self.assertNotIn(SECRET, json.dumps(plan))
        self.assertNotIn(self.f.state['changeSetId'], json.dumps(plan))

    def test_saved_checkpoint_hash_can_bind_the_existing_match_evidence(self):
        import hashlib
        self.f.report['Metadata']['WorkingCheckpoint']['Sha256'] = hashlib.sha256(self.f.checkpoint.read_bytes()).hexdigest()
        self.assertTrue(self.execute()['evidenceBindingVerified'])

    def test_boolean_only_or_conflicting_execution_identity_stops(self):
        with self.assertRaisesRegex(m.PreviewStop, 'missing-evidence-binding'):
            self.execute()
        self.f.report['Stack']['ChangeSetId'] = 'foreign'
        with self.assertRaisesRegex(m.PreviewStop, 'conflicting-evidence-binding'):
            self.execute()

    def test_a_failed_section_or_enabled_gate_cannot_be_ignored(self):
        self.f.report['Events'] = {'Error': {'Class': 'RuntimeError'}}
        with self.assertRaisesRegex(m.PreviewStop, 'evidence-error'):
            self.execute()
        del self.f.report['Events']
        self.f.report['Control']['deliveryEnabled'] = True
        with self.assertRaises(RuntimeError):
            self.execute()

    def test_preview_audit_denies_writes_temp_files_and_network(self):
        import os
        def try_mutations(report):
            for event, args in [('open', ('unused', 'w', os.O_WRONLY)),
                ('socket.connect', ()), ('os.mkdir', ('unused',)), ('tempfile.mkstemp', ())]:
                with self.assertRaises(PermissionError):
                    import sys
                    sys.audit(event, *args)
            raise m.PreviewStop('audit-tested')
        with patch.object(m, 'reject_errors', try_mutations), self.assertRaisesRegex(m.PreviewStop, 'audit-tested'):
            self.execute()


if __name__ == '__main__':
    unittest.main()
