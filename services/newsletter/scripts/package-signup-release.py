"""Offline, deterministic AWS-only signup release. Refuses to overwrite output."""
import argparse, copy, hashlib, io, json, pathlib, re, zipfile

ROOT = pathlib.Path(__file__).resolve().parents[3]
SERVICE = ROOT / 'services/newsletter'
FLAGS = ['DeliveryEnabled', 'RegistrationEnabled', 'ConfirmationEnabled', 'LegacyDispatchRetired', 'ComplianceApproved']
ORIGIN = 'https://lh71lvbqi8.execute-api.eu-north-1.amazonaws.com'
BUCKET = 'chronoverse-nl-artifacts-957261948953-eun1'
def digest(data): return hashlib.sha256(data).hexdigest()
def load(path): return json.loads(path.read_text(encoding='utf-8-sig'))
def write(path, value): path.write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8', newline='\n')

def package(destination, dependency_archive=None, dependency_lock=None, dependency_sha256=None):
    assert not destination.exists(), 'Immutable destination already exists; choose a new version'
    lock = load(SERVICE / 'package-lock.json')
    package_json = load(SERVICE / 'package.json')
    assert package_json['dependencies'] == lock['packages']['']['dependencies']
    # All current production modules, including the pinned legacy-ID snapshot.
    files = {'package.json': (SERVICE / 'package.json').read_bytes()}
    for path in sorted((SERVICE / 'src').iterdir()):
        if path.name != 'migration.mjs' and path.suffix in ['.mjs', '.json']:
            files['src/' + path.name] = path.read_bytes()
    assert len([name for name in files if name.endswith('.mjs')]) == 13
    assert 'src/legacy-publication-exclusions.json' in files
    if dependency_archive:
        assert dependency_lock and dependency_sha256, 'Pinned dependency archive hash and matching lock are required'
        assert digest(dependency_archive.read_bytes()) == dependency_sha256, 'Dependency cache hash mismatch'
        assert dependency_lock.read_bytes() == (SERVICE / 'package-lock.json').read_bytes(), 'Dependency cache uses a different lock'
        with zipfile.ZipFile(dependency_archive) as cached:
            assert cached.testzip() is None
            for name in cached.namelist():
                if name.startswith('node_modules/') and not name.endswith('/'):
                    assert '..' not in pathlib.PurePosixPath(name).parts
                    files[name] = cached.read(name)
        for relative, entry in lock['packages'].items():
            if relative: assert json.loads(files[relative + '/package.json'])['version'] == entry['version'], relative
    for relative, entry in ([] if dependency_archive else lock['packages'].items()):
        if not relative: continue
        folder = SERVICE / relative
        if not (folder / 'package.json').exists():
            # npm overrides can install a locked package below its consumer.
            # Relocate only the exact locked name/version to its lockfile path.
            name = relative.rsplit('node_modules/', 1)[-1]
            candidates = [ROOT / 'node_modules' / name]
            candidates += list((SERVICE / 'node_modules').glob('*/node_modules/' + name))
            candidates += list((SERVICE / 'node_modules').glob('@*/*/node_modules/' + name))
            candidates = [p for p in candidates if (p / 'package.json').exists() and load(p / 'package.json').get('name') == name and load(p / 'package.json')['version'] == entry['version']]
            assert len(candidates) == 1, 'Locked dependency placement unresolved: ' + relative
            folder = candidates[0]
        assert load(folder / 'package.json')['version'] == entry['version'], relative
        for path in sorted(folder.rglob('*')):
            if not path.is_file(): continue
            suffix = path.relative_to(folder)
            # Nested packages are included through their own exact lock entry.
            if 'node_modules' in suffix.parts: continue
            assert not path.is_symlink(), str(path)
            name = relative + '/' + suffix.as_posix()
            assert path.suffix.lower() not in ['.node', '.dll', '.exe', '.so', '.dylib', '.pem', '.key', '.zip'], name
            assert not any(part.startswith('.env') or part in ['.aws', '.git', '.vercel', '.bin'] for part in suffix.parts), name
            files[name] = path.read_bytes()
    for name, data in files.items():
        assert pathlib.PurePosixPath(name).suffix.lower() not in ['.node', '.dll', '.exe', '.so', '.dylib', '.pem', '.key', '.zip'], name
        assert not any(part.startswith('.env') or part in ['.aws', '.git', '.vercel', '.bin'] for part in pathlib.PurePosixPath(name).parts), name
        for match in re.finditer(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|github_pat_[A-Za-z0-9_]{35,}', data):
            # Exact previously reviewed AWS documentation EXAMPLE, not a live key.
            assert name in ['node_modules/@aws-sdk/nested-clients/dist-types/submodules/sts/commands/AssumeRoleCommand.d.ts', 'node_modules/@aws-sdk/nested-clients/dist-types/submodules/sts/commands/AssumeRoleWithWebIdentityCommand.d.ts'] and digest(match.group()) == '1a5d44a2dca19669d72edf4c4f1c27c4c1ca4b4408fbb17f6ce4ad452d78ddb3', name
        if name.startswith('src/'):
            assert not re.search(rb'(?i)(?:password|capabilityKey|websiteKey|legacyV1Key)\s*[:=]\s*[\x22\x27][^\x22\x27\r\n]{16,}[\x22\x27]', data), name
    def archive():
        output = io.BytesIO()
        with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
            for name, data in sorted(files.items()):
                item = zipfile.ZipInfo(name, (2026, 10, 26, 0, 0, 0)); item.compress_type = zipfile.ZIP_DEFLATED; item.external_attr = 0o100644 << 16
                z.writestr(item, data, compresslevel=9)
        return output.getvalue()
    blob = archive(); assert archive() == blob
    assert len(blob) < 50 * 1024**2 and sum(map(len, files.values())) < 250 * 1024**2
    # Launcher changes must also create a different release identity even when
    # the runtime is unchanged; previous immutable ZIPs must never be confused.
    procedure = b''.join((SERVICE / 'scripts' / name).read_bytes() for name in ['cloudshell-signup-release.py', 'initialize-forward-audience.py', 'run-forward-optin-release.py', 'publish-verified-website.py'])
    source_head = __import__('subprocess').check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    release_id = 'forward-optin-20261027-' + digest(blob + procedure + source_head.encode())[:12]
    key = 'newsletter-releases/' + release_id + '/' + digest(blob) + '/newsletter-runtime.zip'
    destination.mkdir(parents=True)
    (destination / 'newsletter-runtime.zip').write_bytes(blob)
    for kind, source in [('main', 'template.json'), ('discovery', 'discovery-template.json')]:
        t = copy.deepcopy(load(SERVICE / source))
        assert all(t['Parameters'][f]['Default'] == 'false' for f in FLAGS)
        t['Parameters']['RuntimeObjectVersion'] = {'Type': 'String', 'MinLength': 1, 'Description': 'Exact non-null VersionId from the new immutable runtime upload.'}
        uri = {'Bucket': BUCKET, 'Key': key, 'Version': {'Ref': 'RuntimeObjectVersion'}}
        if kind == 'main':
            t['Globals']['Function']['CodeUri'] = uri
            t['Parameters']['PublicOrigin']['Default'] = ORIGIN
            t['Parameters']['WeeklyScheduleEnabled'] = {'Type': 'String', 'Default': 'false', 'AllowedValues': ['false', 'true']}
            t['Conditions']['MayRunWeekly'] = {'Fn::And': [{'Condition': 'DigestMaySend'}, {'Fn::Equals': [{'Ref': 'WeeklyScheduleEnabled'}, 'true']}]}
            t['Resources']['WeeklySchedule']['Properties']['State'] = {'Fn::If': ['MayRunWeekly', 'ENABLED', 'DISABLED']}
            t['Parameters']['RegistrationTestRecipient'] = {'Type': 'String', 'Default': '', 'Description': 'Temporary exact owner-authorized recipient restriction; empty for separately approved public signup.'}
            t['Conditions']['HasTestRecipient'] = {'Fn::Not': [{'Fn::Equals': [{'Ref': 'RegistrationTestRecipient'}, '']} ]}
            for policy in t['Resources']['ApiRole']['Properties']['Policies']:
                for conditional in policy['PolicyDocument']['Statement']:
                    statement = conditional.get('Fn::If', [None, {}])[1] if 'Fn::If' in conditional else conditional
                    if 'ses:SendEmail' not in statement.get('Action', []): continue
                    original = statement['Condition']
                    restricted = copy.deepcopy(original)
                    restricted['ForAllValues:StringEquals'] = {'ses:Recipients': [{'Ref': 'RegistrationTestRecipient'}]}
                    restricted['Null'] = {'ses:Recipients': 'false'}
                    statement['Condition'] = {'Fn::If': ['HasTestRecipient', restricted, original]}
            filename = 'main-template.json'
            overlay = {**dict.fromkeys(FLAGS, 'false'), 'PublicOrigin': ORIGIN, 'WeeklyScheduleEnabled': 'false', 'RegistrationTestRecipient': ''}
        else:
            t['Resources']['DiscoveryFunction']['Properties']['CodeUri'] = uri
            t['Parameters']['DiscoveryScheduleEnabled'] = {'Type': 'String', 'Default': 'false', 'AllowedValues': ['false', 'true']}
            t['Conditions']['MayRunDiscovery'] = {'Fn::And': [{'Condition': 'MayDiscover'}, {'Fn::Equals': [{'Ref': 'DiscoveryScheduleEnabled'}, 'true']}]}
            t['Resources']['DailyDiscovery']['Properties']['State'] = {'Fn::If': ['MayRunDiscovery', 'ENABLED', 'DISABLED']}
            scheduler = t['Resources']['DiscoverySchedulerRole']['Properties']
            # Valid IAM policy placement, preserving the reviewed source scope.
            if isinstance(scheduler['Policies'], list):
                for policy in scheduler['Policies']:
                    policy['PolicyDocument']['Statement'] = [st['Fn::If'][1] if 'Fn::If' in st else st for st in policy['PolicyDocument']['Statement']]
                scheduler['Policies'] = {'Fn::If': ['MayDiscover', scheduler['Policies'], {'Ref': 'AWS::NoValue'}]}
            filename = 'discovery-template.json'
            overlay = {**dict.fromkeys(FLAGS, 'false'), 'DiscoveryScheduleEnabled': 'false'}
        write(destination / filename, t)
        write(destination / (kind + '-disabled-overlay.json'), [{'ParameterKey': k, 'ParameterValue': v} for k, v in overlay.items()])
    (destination / 'package-lock.json').write_bytes((SERVICE / 'package-lock.json').read_bytes())
    (destination / 'cloudshell-release.py').write_bytes((SERVICE / 'scripts/cloudshell-signup-release.py').read_bytes())
    (destination / 'run-forward-optin-release.py').write_bytes((SERVICE / 'scripts/run-forward-optin-release.py').read_bytes())
    (destination / 'initialize-forward-audience.py').write_bytes((SERVICE / 'scripts/initialize-forward-audience.py').read_bytes())
    (destination / 'publish-verified-website.py').write_bytes((SERVICE / 'scripts/publish-verified-website.py').read_bytes())
    (destination / 'RUNBOOK.md').write_bytes((ROOT / 'docs/newsletter-forward-optin-release-2026-10-27.md').read_bytes())
    write(destination / 'runtime-files.json', {name: digest(data) for name, data in sorted(files.items())})
    write(destination / 'release.json', {'releaseId': release_id, 'region': 'eu-north-1', 'account': '957261948953', 'stack': 'chronoverse-newsletter-v2', 'origin': ORIGIN,
        'bucket': BUCKET, 'artifactKey': key, 'runtimeSha256': digest(blob), 'modules': [name for name in files if name.startswith('src/')],
        'lockedPackages': len(lock['packages']) - 1, 'compressedBytes': len(blob), 'expandedBytes': sum(map(len, files.values())),
        'sourceHead': source_head,
        'sourceWorkingTreeIncluded': bool(__import__('subprocess').check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True).strip()),
        'websiteCommitIdentity': {key: __import__('subprocess').check_output(['git', 'config', 'user.' + key], cwd=ROOT, text=True).strip() for key in ['name', 'email']},
        'enrollmentPolicy': 'aws-fresh-double-opt-in-2026-10-27-v1',
        'legacyKey': 'Unavailable; no recovery or replacement. Historical consent excluded pending fresh AWS double opt-in; manual verified support opt-out.',
        'audienceMode': 'FORWARD_ONLY_ZERO_CONFIRMED', 'historicalRecoveryStatus': 'HISTORICAL_RECOVERY_UNRESOLVED',
        'publicSignup': 'BLOCKED_PENDING_CONTROLLED_LIVE_TEST', 'blockers': ['Actual SES confirmation, unsubscribe and feedback require the owner CloudShell/inbox run before public activation'],
        'dependencies': {'mode': 'Exact-lock, SHA-256 verified dependency cache only; all runtime source/templates freshly read' if dependency_archive else 'Installed exact-lock packages', 'cacheSha256': dependency_sha256, 'lockSha256': digest((SERVICE / 'package-lock.json').read_bytes())},
        'companion': 'The existing discovery companion is updated only after controlled consent/suppression tests, verified website deployment and review of both future schedule change sets. No discovery is invoked.'})
    (destination / 'SHA256SUMS').write_text(''.join(digest(p.read_bytes()) + '  ' + p.name + '\n' for p in sorted(destination.iterdir()) if p.is_file()), encoding='utf-8', newline='\n')
    print(json.dumps({'directory': str(destination), 'releaseId': release_id, 'runtimeSha256': digest(blob), 'files': len(files)}))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--out', required=True, type=pathlib.Path)
    parser.add_argument('--dependency-archive', type=pathlib.Path); parser.add_argument('--dependency-lock', type=pathlib.Path); parser.add_argument('--dependency-sha256')
    args = parser.parse_args()
    package(args.out.resolve(), args.dependency_archive, args.dependency_lock, args.dependency_sha256)
