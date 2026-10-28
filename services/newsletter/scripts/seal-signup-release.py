"""Offline release validation and immutable outer ZIP. No credentials, cloud calls or Git writes."""
import argparse, hashlib, io, json, pathlib, re, zipfile

ROOT = pathlib.Path(__file__).resolve().parents[3]


def require(ok, message):
    if not ok: raise RuntimeError(message)


def sha(data): return hashlib.sha256(data).hexdigest()


def validate(directory):
    files = {p.name: p.read_bytes() for p in directory.iterdir() if p.is_file()}
    require(len(files) == len(list(directory.iterdir())) and not any(n.startswith('.') for n in files), 'Only public release files may be sealed')
    manifest = {}
    for line in files['SHA256SUMS'].decode().splitlines():
        expected, name = line.split('  ', 1)
        require(pathlib.PurePosixPath(name).name == name and name not in manifest and sha(files[name]) == expected, 'Release checksum mismatch')
        manifest[name] = expected
    require(set(manifest) == set(files) - {'SHA256SUMS'}, 'Unmanifested release file')
    meta = json.loads(files['release.json'])
    require(meta['privateSignupRepair'] is True and meta['account'] == '957261948953' and meta['region'] == 'eu-north-1' and
            meta['stack'] == 'chronoverse-newsletter-v2' and meta['origin'] == 'https://lh71lvbqi8.execute-api.eu-north-1.amazonaws.com', 'Unexpected release target/profile')
    require(sha(files['newsletter-runtime.zip']) == meta['runtimeSha256'], 'Runtime hash mismatch')
    runtime_manifest = json.loads(files['runtime-files.json'])
    lock = json.loads(files['package-lock.json'])
    with zipfile.ZipFile(io.BytesIO(files['newsletter-runtime.zip'])) as runtime:
        require(runtime.testzip() is None and len(runtime.namelist()) == len(set(runtime.namelist())) and set(runtime.namelist()) == set(runtime_manifest), 'Runtime ZIP manifest mismatch')
        for name, expected in runtime_manifest.items():
            require('..' not in pathlib.PurePosixPath(name).parts and '\\' not in name and not name.startswith('/'), 'Unsafe runtime path')
            require(sha(runtime.read(name)) == expected, 'Runtime file checksum mismatch')
            if name.startswith('src/') or name == 'package.json':
                require(runtime.read(name) == (ROOT / 'services/newsletter' / name).read_bytes(), 'Packaged runtime differs from current source')
        require(len([n for n in runtime_manifest if n.startswith('src/') and n.endswith('.mjs')]) == 13 and 'src/migration.mjs' not in runtime_manifest, 'Runtime source inventory mismatch')
        require(json.loads(runtime.read('package.json'))['dependencies'] == lock['packages']['']['dependencies'], 'Runtime dependency contract mismatch')
        for name, entry in lock['packages'].items():
            if name: require(json.loads(runtime.read(name + '/package.json'))['version'] == entry['version'], 'Packaged dependency differs from lock')
    for name, data in files.items():
        if name.endswith('.py'):
            compile(data, name, 'exec')
            source = 'cloudshell-signup-release.py' if name == 'cloudshell-release.py' else name
            require(data == (ROOT / 'services/newsletter/scripts' / source).read_bytes(), 'Packaged procedure differs from current source')
    for kind in ['main', 'discovery']:
        template = json.loads(files[kind + '-template.json'])
        for flag in ['DeliveryEnabled', 'RegistrationEnabled', 'ConfirmationEnabled', 'LegacyDispatchRetired', 'ComplianceApproved']:
            require(template['Parameters'][flag]['Default'] == 'false', 'Unsafe activation default')
        schedule_flag = 'WeeklyScheduleEnabled' if kind == 'main' else 'DiscoveryScheduleEnabled'
        require(template['Parameters'][schedule_flag]['Default'] == 'false', 'Unsafe scheduling default')
    require(json.loads(files['main-template.json'])['Resources']['Ledger']['DeletionPolicy'] == 'Retain', 'Subscriber retention missing')
    require({'run-private-signup-repair.py', 'recover-private-signup.py', 'run-verified-activation.py', 'website-activation.patch'} <= files.keys(), 'Incomplete recovery/activation artifact')
    require(b'NEWSLETTER_SIGNUPS_PAUSED = false;' in files['website-activation.patch'], 'Website activation patch missing')
    return files, meta


def seal(directory, archive):
    require(not archive.exists(), 'Immutable ZIP already exists; choose a new path')
    files, meta = validate(directory)
    require(re.fullmatch(r'[A-Za-z0-9_-]+\.zip', archive.name) and re.fullmatch(r'[a-z0-9-]+', meta['releaseId']), 'Unsafe command filename or release identity')
    with zipfile.ZipFile(archive, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as output:
        for name, data in sorted(files.items()):
            item = zipfile.ZipInfo(name, (2026, 10, 27, 0, 0, 0)); item.compress_type = zipfile.ZIP_DEFLATED; item.external_attr = 0o100600 << 16
            output.writestr(item, data, compresslevel=9)
    with zipfile.ZipFile(archive) as output: require(output.testzip() is None, 'Outer ZIP integrity failed')
    digest = sha(archive.read_bytes())
    command = ('umask 077 && python3 -c \'import hashlib,pathlib,sys,zipfile; p=pathlib.Path("' + archive.name + '"); '
               'sys.exit("ZIP checksum mismatch") if hashlib.sha256(p.read_bytes()).hexdigest() != "' + digest + '" else None; '
               'd=pathlib.Path("' + meta['releaseId'] + '"); zipfile.ZipFile(p).extractall(d) if not d.exists() else None\' && python3 ' + meta['releaseId'] + '/run-private-signup-repair.py')
    (archive.parent / 'EXECUTE.txt').write_text(command + '\n', encoding='utf-8', newline='\n')
    summary = {'zip': str(archive), 'zipSha256': digest, 'zipBytes': archive.stat().st_size,
               'releaseId': meta['releaseId'], 'runtimeSha256': meta['runtimeSha256'], 'releaseValidation': 'PASS', 'command': command}
    (archive.parent / 'validation.json').write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('directory', type=pathlib.Path); parser.add_argument('--zip', required=True, type=pathlib.Path)
    args = parser.parse_args(); seal(args.directory.resolve(), args.zip.resolve())
