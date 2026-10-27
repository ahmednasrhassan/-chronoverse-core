"""Publish the signup link only after the managed consent/opt-out tests pass.

Uses an existing Git authentication setup, never an embedded credential. Failed
builds/pushes leave AWS delivery gated and can resume without sending test mail.
"""
import json
import os
import pathlib
import subprocess
import time
import urllib.error
import urllib.request

REMOTE = 'https://github.com/ahmednasrhassan/-chronoverse-core.git'


def require(ok, message):
    if not ok: raise RuntimeError(message)


def command(args, directory):
    env = dict(os.environ, GIT_TERMINAL_PROMPT='0', NEXT_TELEMETRY_DISABLED='1')
    result = subprocess.run(args, cwd=directory, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    # Never print subprocess errors: authenticated Git/npm URLs can contain credentials.
    if result.returncode:
        fd = os.open(directory.parent / '.website-last-failure.log', os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'w') as stream: stream.write(result.stdout)
    require(result.returncode == 0, 'Website ' + args[0] + ' operation failed. Inspect the private checkout; ensure existing Git push authentication, Node >=22 and npm are available, then resume the same release directory.')
    return result.stdout.rstrip()


def publish(release, here):
    require(release.state.get('testPassed') is True and release.state.get('unsubscribeObserved') is True and release.state.get('feedbackMessageId'),
            'Actual confirmation, unsubscribe and feedback tests must pass before website publication')
    require(release.state.get('deployedPhase') == 'public' and release.http('GET', '/register') == 200,
            'AWS public registration is not ready for the website link')
    release.isolation()
    checkout = here / 'website-checkout'
    if not (checkout / '.git').is_dir():
        require(not checkout.exists(), 'Website checkout path already exists without Git; preserve it and inspect')
        print('Cloning the reviewed website source; no subscriber data or AWS credentials are copied.')
        command(['git', 'clone', '--branch', 'master', '--single-branch', REMOTE, str(checkout)], here)
    require(command(['git', 'remote', 'get-url', 'origin'], checkout) == REMOTE, 'Wrong website Git remote')
    marker = {'releaseId': release.meta['releaseId'], 'sourceCommit': release.meta['sourceHead'],
              'runtimeSha256': release.meta['runtimeSha256'], 'audienceReceiptSha256': release.control()['forwardOnlyReceipt'], 'controlledTestPassed': True}
    if not release.state.get('websiteCandidateSha'):
        require(command(['git', 'branch', '--show-current'], checkout) == 'master', 'Website checkout is not master')
        require(command(['git', 'rev-parse', 'HEAD'], checkout) == release.meta['sourceHead'], 'origin/master advanced beyond the reviewed release. Prepare a release from the new HEAD; do not force-push.')
        path = checkout / 'src/config/newsletterAvailability.ts'
        content = path.read_text()
        if release.state.get('websiteEditStarted'):
            expected = command(['git', 'show', 'HEAD:src/config/newsletterAvailability.ts'], checkout).replace('NEWSLETTER_SIGNUPS_PAUSED = true;', 'NEWSLETTER_SIGNUPS_PAUSED = false;')
            require(content.strip() == expected.strip() and json.loads((checkout / 'public/newsletter-release.json').read_text()) == marker,
                    'Prepared website activation changed; preserve and inspect it')
            changed = {line[3:] for line in command(['git', 'status', '--porcelain'], checkout).splitlines() if line}
            require(changed <= {'src/config/newsletterAvailability.ts', 'public/newsletter-release.json'}, 'Unreviewed website changes; preserve and inspect')
        else:
            require(not command(['git', 'status', '--porcelain'], checkout), 'Website checkout has unreviewed changes; preserve and inspect them')
            require(content.count('NEWSLETTER_SIGNUPS_PAUSED = true;') == 1, 'Website pause switch is not the reviewed version')
            release.state['websiteEditStarted'] = True; release.save()
            path.write_text(content.replace('NEWSLETTER_SIGNUPS_PAUSED = true;', 'NEWSLETTER_SIGNUPS_PAUSED = false;'), encoding='utf-8', newline='\n')
            (checkout / 'public/newsletter-release.json').write_text(json.dumps(marker, sort_keys=True) + '\n', encoding='utf-8', newline='\n')
        build_and_commit(release, checkout)
    candidate = release.state['websiteCandidateSha']
    require(command(['git', 'rev-parse', 'HEAD'], checkout) == candidate and not command(['git', 'status', '--porcelain'], checkout),
            'Website candidate was modified; preserve and inspect it')
    # A lost acknowledgement is reconciled against master before retrying a push.
    remote_sha = command(['git', 'ls-remote', 'origin', 'refs/heads/master'], checkout).split()[0]
    require(remote_sha in [release.meta['sourceHead'], candidate], 'Remote master changed; do not overwrite or force-push')
    if remote_sha != candidate:
        command(['git', 'push', 'origin', 'HEAD:master'], checkout)
    require(command(['git', 'ls-remote', 'origin', 'refs/heads/master'], checkout).split()[0] == candidate, 'Website push readback failed')
    release.state['websiteCommit'] = candidate; release.save()
    print('Website activation committed and pushed normally: ' + candidate + '. Waiting for its production deployment.')
    for attempt in range(90):
        try:
            with urllib.request.urlopen('https://chronoversecapital.com/newsletter-release.json?release=' + release.meta['releaseId'], timeout=20) as response:
                actual = json.loads(response.read(16384))
            with urllib.request.urlopen('https://chronoversecapital.com/newsletter?release=' + release.meta['releaseId'], timeout=20) as response:
                page = response.read(2 * 1024 * 1024).decode('utf-8')
            if actual == marker and ('href="' + release.meta['origin'] + '/register"') in page:
                release.state['websiteProductionVerified'] = True; release.save()
                print('PRODUCTION WEBSITE VERIFIED: direct AWS Subscribe link and exact release marker.')
                return candidate
        except (urllib.error.URLError, TimeoutError, ValueError):
            pass
        if attempt % 6 == 0: print('Waiting for the matching website deployment; weekly delivery is still disabled.')
        time.sleep(10)
    raise RuntimeError('Website push succeeded but its matching production deployment is not visible. Resolve the Vercel build/deployment for the recorded website commit, then resume; weekly delivery remains disabled.')


def build_and_commit(release, checkout):
    for args in [['npm', 'ci', '--no-audit', '--no-fund'], ['npm', 'ci', '--prefix', 'services/newsletter', '--no-audit', '--no-fund'],
                 ['npm', 'run', 'typecheck'], ['npm', 'test'], ['npm', 'run', 'build', '--', '--webpack']]:
        print('Verifying website: ' + ' '.join(args))
        command(args, checkout)
    command(['git', 'add', '--', 'src/config/newsletterAvailability.ts', 'public/newsletter-release.json'], checkout)
    identity = release.meta['websiteCommitIdentity']
    command(['git', '-c', 'user.name=' + identity['name'], '-c', 'user.email=' + identity['email'],
             'commit', '-m', 'Enable AWS newsletter signup after verified consent and suppression tests'], checkout)
    release.state['websiteCandidateSha'] = command(['git', 'rev-parse', 'HEAD'], checkout); release.save()
