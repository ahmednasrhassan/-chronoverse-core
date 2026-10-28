"""Read-only preview of saved reconciliation; never invokes the receipt writer.

No AWS read is repeated. Boolean-only historical identity matches are insufficient:
the retained evidence must bind actual change-set IDs or the checkpoint SHA256.
"""
import argparse
import hashlib
import json
import os
import pathlib
import sys

FINALIZER_SHA256 = '608485c15ccec1997f03179160c32a685064be4aa628596614e8b03e49edc125'


class PreviewStop(RuntimeError):
    pass


def reject_errors(value):
    if isinstance(value, dict):
        if any(k in value for k in ('Error', 'ErrorClass', 'AwsErrorCode', 'Failure', 'STOP')):
            raise PreviewStop('evidence-error')
        for item in value.values():
            reject_errors(item)
    elif isinstance(value, list):
        for item in value:
            reject_errors(item)


def preview(evidence, root=pathlib.Path('/home/cloudshell-user')):
    active = [True]

    def audit(event, args):
        if not active[0]:
            return
        if event == 'open':
            mode, flags = args[1:3]
            if (isinstance(mode, str) and any(c in mode for c in 'wax+')) or (
                isinstance(flags, int) and flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC | os.O_APPEND)):
                raise PermissionError('read-only-preview')
        if event.startswith(('socket.', 'subprocess.', 'tempfile.')) or event in {
            'os.system', 'os.fork', 'os.forkpty', 'os.exec', 'os.posix_spawn', 'os.remove',
            'os.rename', 'os.rmdir', 'os.mkdir', 'os.link', 'os.symlink', 'os.truncate',
            'os.chmod', 'os.chown', 'os.utime'}:
            raise PermissionError('read-only-preview')

    sys.addaudithook(audit)
    try:
        source = pathlib.Path(__file__).with_name('finalize_deployment.py')
        if source.is_symlink():
            raise PreviewStop('source-symlink')
        raw_source = source.read_bytes()
        if hashlib.sha256(raw_source).hexdigest() != FINALIZER_SHA256:
            raise PreviewStop('finalizer-checksum')
        ns = {'__name__': 'readonly_preview', '__file__': str(source)}
        exec(compile(raw_source, str(source), 'exec'), ns)
        if not evidence.is_absolute():
            raise PreviewStop('absolute-evidence-path-required')
        raw = ns['regular'](evidence)
        report = ns['decode'](raw)
        reject_errors(report)
        if report['RecordedChangeSet']['Status'] != 'CREATE_COMPLETE':
            raise PreviewStop('changeset-status')
        plan, _ = ns['review'](evidence, root)
        if ns['digest'](raw) != plan['evidenceSha256']:
            raise PreviewStop('evidence-drift')
        cp_name = ns['WORK'] + '/.confirmation-fix-state.json'
        identifier = ns['decode'](ns['regular'](root / cp_name))['changeSetId']
        saved_hash = report['Metadata']['WorkingCheckpoint'].get('Sha256')
        saved_id = report['RecordedChangeSet'].get('ChangeSetId')
        stack_id = report['Stack'].get('ChangeSetId')
        if (saved_hash is not None and saved_hash != plan['watchedFileSha256'][cp_name]) or any(
            v is not None and v != identifier for v in (saved_id, stack_id)):
            raise PreviewStop('conflicting-evidence-binding')
        if saved_hash != plan['watchedFileSha256'][cp_name] and not (saved_id == identifier and stack_id == identifier):
            raise PreviewStop('missing-evidence-binding')
        if ns['digest'](ns['regular'](evidence)) != plan['evidenceSha256'] or any(
            ns['digest'](ns['regular'](root / name)) != expected for name, expected in plan['watchedFileSha256'].items()):
            raise PreviewStop('input-drift')
        return {'mode': 'READ_ONLY_PREVIEW', 'finalizerSha256': FINALIZER_SHA256,
            'evidenceBindingVerified': True, **plan}
    finally:
        active[0] = False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--saved-evidence', type=pathlib.Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(preview(args.saved_evidence), indent=2, sort_keys=True))
    except (Exception, KeyboardInterrupt) as error:
        print(json.dumps({'STOP': True, 'Class': type(error).__name__,
            'Guard': str(error) if type(error) is PreviewStop else 'local-preview-rejected',
            'ReceiptWriteAuthorized': False}))
        raise SystemExit(1)


if __name__ == '__main__':
    main()
