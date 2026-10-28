"""Offline delta package for only POST /confirm and its browser document policy."""
import argparse, hashlib, importlib.util, io, json, os, pathlib, re, zipfile

ROOT = pathlib.Path(__file__).resolve().parents[3]
SCRIPTS = ROOT / 'services/newsletter/scripts'
MODULES = ['src/aws.mjs', 'src/http.mjs', 'src/service.mjs']
BASE_ID = 'private-signup-repair-20261027-739404fe3d61'
BASE_RUNTIME = '89636d5a22d004e9274a0a6190a46de1904a2c7516cfa70624f62845a3f258c8'


def sha(data): return hashlib.sha256(data).hexdigest()


def execution_command(archive, patch_id):
    assert archive.name == 'chronoverse-confirmation-fix.zip' and patch_id.startswith('confirmation-post-fix-') and len(patch_id.rsplit('-', 1)[1]) == 12
    return ('umask 077 && python3 -c \'import hashlib,pathlib,sys,zipfile; p=pathlib.Path("' + archive.name + '"); '
            'sys.exit("ZIP checksum mismatch") if hashlib.sha256(p.read_bytes()).hexdigest() != "' + sha(archive.read_bytes()) + '" else None; '
            'd=pathlib.Path("' + patch_id + '"); zipfile.ZipFile(p).extractall(d) if not d.exists() else None\' && python3 ' + patch_id + '/deploy-confirmation-fix.py')


def runtime_delta(base, reviewed):
    # Package exact reviewed ZIP records, including their compressed payloads.
    # CloudShell copies these bytes; its Python/zlib version cannot change them.
    parts, chunks, delta_size = [], [], 0
    def append(source, offset, length):
        if not length: return
        if parts and parts[-1]['source'] == source and parts[-1]['offset'] + parts[-1]['length'] == offset:
            parts[-1]['length'] += length
        else: parts.append({'source': source, 'offset': offset, 'length': length})
    def replacement(data):
        nonlocal delta_size
        append('delta', delta_size, len(data)); chunks.append(data); delta_size += len(data)
    with zipfile.ZipFile(io.BytesIO(base)) as old, zipfile.ZipFile(io.BytesIO(reviewed)) as new:
        assert old.namelist() == new.namelist() and old.testzip() is None and new.testzip() is None
        old_info, new_info = old.infolist(), new.infolist()
        assert len(old_info) == len(set(old.namelist())) and old_info[0].header_offset == new_info[0].header_offset == 0
        for i, (a, b) in enumerate(zip(old_info, new_info)):
            old_end = old_info[i+1].header_offset if i+1 < len(old_info) else old.start_dir
            new_end = new_info[i+1].header_offset if i+1 < len(new_info) else new.start_dir
            assert a.header_offset < old_end <= old.start_dir and b.header_offset < new_end <= new.start_dir
            original_record, reviewed_record = base[a.header_offset:old_end], reviewed[b.header_offset:new_end]
            if original_record == reviewed_record: append('base', a.header_offset, len(original_record))
            else: replacement(reviewed_record)
        replacement(reviewed[new.start_dir:])
    delta = b''.join(chunks)
    assert sum(p['length'] for p in parts) == len(reviewed)
    assert b''.join((base if p['source'] == 'base' else delta)[p['offset']:p['offset']+p['length']] for p in parts) == reviewed
    return delta, {'format': 'zip-record-copy-v1', 'deltaSha256': sha(delta), 'deltaBytes': len(delta), 'runtimeBytes': len(reviewed), 'parts': parts}


def package(original, destination, reviewed_runtime=None):
    assert not destination.exists(), 'Immutable destination exists; choose another output directory'
    recipient = os.environ.get('NEWSLETTER_TEST_MAILBOX', '')
    assert re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', recipient), 'Set private NEWSLETTER_TEST_MAILBOX explicitly; no default recipient'
    baseline_meta = json.loads((original / 'release.json').read_bytes())
    assert baseline_meta['releaseId'] == BASE_ID and baseline_meta['runtimeSha256'] == BASE_RUNTIME
    base = (original / 'newsletter-runtime.zip').read_bytes(); assert sha(base) == BASE_RUNTIME
    for line in (original / 'SHA256SUMS').read_text().splitlines():
        expected, name = line.split('  ', 1)
        assert pathlib.PurePosixPath(name).name == name and '\\' not in name and sha((original/name).read_bytes()) == expected
    patches = {name: (ROOT / 'services/newsletter' / name).read_bytes() for name in MODULES}
    with zipfile.ZipFile(io.BytesIO(base)) as archive:
        before = {name: sha(archive.read(name)) for name in MODULES}
        # Do not silently ship any unrelated current-source changes.
        for name in archive.namelist():
            if name.startswith('src/') and name not in MODULES:
                assert archive.read(name) == (ROOT / 'services/newsletter' / name).read_bytes(), name
    procedure = (SCRIPTS / 'cloudshell-confirmation-fix.py').read_bytes()
    runbook = (ROOT / 'docs/newsletter-confirmation-post-fix-2026-10-27.md').read_bytes()
    meta = {'originalReleaseId': BASE_ID, 'baseRuntimeSha256': BASE_RUNTIME,
            'originalManifestSha256': sha((original/'SHA256SUMS').read_bytes()), 'testRecipient': recipient,
            'account': '957261948953', 'region': 'eu-north-1', 'stack': 'chronoverse-newsletter-v2',
            'templateComparison': 'canonical-json-object-keys', 'postDeployment': 'HOLD_FRESH_CONSENT_REQUIRED',
            'patches': {name: {'before': before[name], 'after': sha(data)} for name, data in patches.items()}}
    destination.mkdir(parents=True); release = destination / 'confirmation-fix'; release.mkdir()
    for name, data in patches.items():
        path = release/name; path.parent.mkdir(exist_ok=True); path.write_bytes(data)
    # Review archive bytes once offline; never regenerate them on the AWS host.
    spec = importlib.util.spec_from_file_location('confirmation_patch', SCRIPTS/'cloudshell-confirmation-fix.py')
    helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper); helper.HERE = release
    if reviewed_runtime:
        reviewed = reviewed_runtime.read_bytes()
    else:
        output = io.BytesIO()
        with zipfile.ZipFile(io.BytesIO(base)) as old, zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as new:
            for info in old.infolist(): new.writestr(info, patches.get(info.filename, old.read(info.filename)), compresslevel=9)
        reviewed = output.getvalue()
    meta['runtimeSha256'] = sha(reviewed)
    delta, meta['runtimeAssembly'] = runtime_delta(base, reviewed)
    identity = sha(procedure + runbook + json.dumps(meta, sort_keys=True, separators=(',', ':')).encode() + delta)[:12]
    meta['patchId'] = 'confirmation-post-fix-' + identity
    (release/'runtime.delta').write_bytes(delta)
    blob = helper.reconstruct(original, meta)
    assert blob == reviewed
    with zipfile.ZipFile(io.BytesIO(base)) as old, zipfile.ZipFile(io.BytesIO(blob)) as new:
        assert old.namelist() == new.namelist() and new.testzip() is None
        assert {name for name in old.namelist() if old.read(name) != new.read(name)} == set(MODULES)
    (release/'deploy-confirmation-fix.py').write_bytes(procedure)
    (release/'RUNBOOK.md').write_bytes(runbook)
    (release/'patch.json').write_text(json.dumps(meta, indent=2)+'\n', encoding='utf-8', newline='\n')
    for path in release.rglob('*.py'): compile(path.read_bytes(), path.name, 'exec')
    (release/'SHA256SUMS').write_text(''.join(sha(p.read_bytes())+'  '+p.relative_to(release).as_posix()+'\n' for p in sorted(release.rglob('*')) if p.is_file()), encoding='utf-8', newline='\n')
    archive = destination/'chronoverse-confirmation-fix.zip'
    with zipfile.ZipFile(archive, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as output:
        for path in sorted(release.rglob('*')):
            if not path.is_file(): continue
            info = zipfile.ZipInfo(path.relative_to(release).as_posix(), (2026,10,27,0,0,0)); info.compress_type=zipfile.ZIP_DEFLATED; info.external_attr=0o100600<<16
            output.writestr(info, path.read_bytes(), compresslevel=9)
    with zipfile.ZipFile(archive) as zipped: assert zipped.testzip() is None
    command = execution_command(archive, meta['patchId'])
    (destination/'EXECUTE.txt').write_text(command+'\n', encoding='utf-8', newline='\n')
    result = {'zip': str(archive), 'bytes': archive.stat().st_size, 'zipSha256': sha(archive.read_bytes()),
              'patchId': meta['patchId'], 'runtimeSha256': meta['runtimeSha256'], 'onlyRuntimeModulesChanged': MODULES,
              'cloudFormationScope': 'Exactly ApiFunction.Code and HttpApi.Body without replacement; identical integrations and existing private route IAM pinned in SAM; all other processed properties/resources unchanged',
              'runtimeAssembly': 'Exact reviewed bytes; no cloud recompression',
              'templateComparison': 'Canonical full JSON; object ordering ignored, all values/properties/arrays preserved',
              'postDeployment': 'Enrollment CLOSED; weekly OFF; exposed token never reused; fresh consent needs separate approved test',
              'validation': 'PASS: exact base, manifests, source scope, byte-copy reconstruction, Python syntax and ZIP CRC', 'command': command}
    (destination/'validation.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8', newline='\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--original-release', type=pathlib.Path, required=True); parser.add_argument('--out', type=pathlib.Path, required=True)
    parser.add_argument('--reviewed-runtime', type=pathlib.Path)
    args=parser.parse_args(); package(args.original_release.resolve(), args.out.resolve(), args.reviewed_runtime.resolve() if args.reviewed_runtime else None)
