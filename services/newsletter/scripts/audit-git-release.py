"""Read-only review of the explicit newsletter synchronization allowlist.

Never stages/commits/pushes files, reads excluded data, or calls AWS/Vercel.
"""
import hashlib
import json
import pathlib
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[3]
INVENTORY = 'docs/newsletter-git-sync-files-2026-10-28.json'
BASE = 'df57410cdd96e3922cc0c22d25613a867f44eb9e'


def require(ok, code):
    if not ok:
        raise RuntimeError(code)


def sha(data):
    return hashlib.sha256(data.replace(b'\r\n', b'\n')).hexdigest()


def audit():
    plan = json.loads((ROOT / INVENTORY).read_bytes())
    require(plan['baseCommit'] == BASE, 'wrong-plan-base')
    require(subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip() == BASE, 'head-changed-review-required')
    entries = plan['include']
    names = [row['path'] for row in entries]
    require(len(names) == len(set(names)), 'duplicate-allowlist-path')
    forbidden = re.compile(r'(^|/)(\.env[^/]*|\.aws|\.vercel|\.verification|releases?|checkpoints|subscriber-data|claims|suppression-state)(/|$)|(?:\.zip|\.pem|\.key|\.cvnb|\.pyc)$|(?:-RECEIPT\.json|\.cloudshell-release-state|\.confirmation-fix-state)', re.I)
    for row in entries:
        name = row['path']; relative = pathlib.PurePosixPath(name)
        require(not relative.is_absolute() and '..' not in relative.parts and '\\' not in name and not forbidden.search(name), 'excluded-path-in-allowlist')
        path = ROOT / name
        require(path.is_file() and not path.is_symlink(), 'missing-or-symlinked-source')
        blob = path.read_bytes()
        if name != INVENTORY:
            require(row['sha256CanonicalLf'] == sha(blob), 'source-drift-review-required: ' + name)
        else:
            require(row['sha256CanonicalLf'] is None, 'inventory-self-binding')
        text = blob.decode('utf-8')
        require(not re.search(r'v2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}', text), 'literal-capability-in-source: ' + name)
        require(not re.search(r'(?:AKIA|ASIA)[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', text), 'credential-in-source: ' + name)
        for email in re.findall(r'[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', text):
            require(email.endswith(('.test', '@example.com', '@example.org', '@example.invalid', '@chronoversecapital.com')), 'private-mailbox-in-source: ' + name)
    status = subprocess.check_output(['git', 'status', '--porcelain', '-uall'], cwd=ROOT, text=True)
    require({line[3:] for line in status.splitlines()} == set(names), 'working-tree-differs-from-explicit-plan')
    staged = subprocess.check_output(['git', 'diff', '--cached', '--name-only'], cwd=ROOT, text=True).splitlines()
    require(set(staged) <= set(names), 'unexpected-staged-path')
    manifest = json.loads((ROOT / 'services/newsletter/deployments/deployment-reviewed-2026-10-28.json').read_bytes())
    for name, expected in manifest['gitSource']['runtimeSourceSha256'].items():
        require(hashlib.sha256((ROOT / 'services/newsletter' / name).read_bytes()).hexdigest() == expected, 'reviewed-runtime-source-drift')
    for name, expected in manifest['gitSource']['baseRuntimeSourceSha256'].items():
        source = manifest['gitSource']['baseSourceOverrides'].get(name, name)
        require(hashlib.sha256((ROOT / 'services/newsletter' / source).read_bytes()).hexdigest() == expected, 'base-runtime-source-drift')
    require(sha((ROOT / 'services/newsletter/package-lock.json').read_bytes()) == manifest['gitSource']['dependencyLockCanonicalSha256'], 'dependency-lock-drift')
    require(json.loads((ROOT / 'vercel.json').read_bytes())['git']['deploymentEnabled']['master'] is False, 'vercel-master-hold-missing')
    require('NEWSLETTER_SIGNUPS_PAUSED = true;' in (ROOT / 'src/config/newsletterAvailability.ts').read_text(), 'website-pause-changed')
    print(json.dumps({'result': 'REVIEW_READY_NO_GIT_MUTATION', 'baseCommit': BASE, 'includedFiles': len(entries),
        'inventorySha256': hashlib.sha256((ROOT / INVENTORY).read_bytes()).hexdigest(),
        'manifestSha256': hashlib.sha256((ROOT / 'services/newsletter/deployments/deployment-reviewed-2026-10-28.json').read_bytes()).hexdigest(),
        'stagedFiles': len(staged), 'runtimeSourceFilesMatch': len(manifest['gitSource']['runtimeSourceSha256']),
        'vercelMasterAutomaticDeployment': False}, indent=2))


if __name__ == '__main__':
    try:
        audit()
    except (Exception, KeyboardInterrupt) as error:
        print(json.dumps({'STOP': True, 'Class': type(error).__name__,
            'Guard': str(error) if type(error) is RuntimeError else 'local-audit-rejected'}))
        raise SystemExit(1)
