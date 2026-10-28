"""Separate owner-approved activation after the private repair; never runs Git or sends a test email."""
import argparse, hashlib, importlib.util, json, os, pathlib, re, urllib.request

HERE = pathlib.Path(__file__).resolve().parent


def require(ok, message):
    if not ok: raise RuntimeError(message)


def marker(r):
    return {'releaseId': r.meta['releaseId'], 'sourceCommit': r.meta['sourceHead'],
            'runtimeSha256': r.meta['runtimeSha256'], 'audienceReceiptSha256': r.control()['forwardOnlyReceipt'],
            'controlledTestPassed': True}


def verify_website(r, website_sha):
    require(re.fullmatch(r'[a-f0-9]{40}', website_sha or ''), 'Supply the approved, deployed website commit with --website-sha')
    # The exact release marker binds the visible link to this verified runtime.
    with urllib.request.urlopen('https://chronoversecapital.com/newsletter-release.json?release=' + r.meta['releaseId'], timeout=25) as response:
        require(response.status == 200 and json.loads(response.read(16384)) == marker(r), 'Live website release marker mismatch; weekly remains OFF')
    with urllib.request.urlopen('https://chronoversecapital.com/newsletter', timeout=25) as response:
        require(response.status == 200 and ('href="' + r.meta['origin'] + '/register"') in response.read(2*1024*1024).decode('utf-8'),
                'Live website direct AWS Subscribe link missing; weekly remains OFF')


def activate_public(helper, approve=input):
    r = helper.Release()
    require(r.state.get('testPassed') is True, 'Complete run-private-signup-repair.py first; no signup will be repeated')
    require(not r.state.get('weeklyExecutionStarted'), 'Weekly activation already started; inspect its saved result before changing gates')
    r.close(True); r.readiness(False, False); r.finish()
    require(approve('Private confirmation/delivery, unsubscribe and managed feedback verified. Type OPEN VERIFIED PUBLIC SIGNUP: ').strip() == 'OPEN VERIFIED PUBLIC SIGNUP',
            'Public opening not approved')
    r.state['activationApprovedRuntime'] = r.meta['runtimeSha256']; r.save()
    if r.state.get('deployedPhase') != 'public':
        r.prepare('public', True)
        changes = json.loads((HERE / 'change-set-review.json').read_text()); print(json.dumps(changes, indent=2))
        name = changes['ChangeSetName']
        require(approve('Review actual changes; type EXECUTE ' + name + ': ').strip() == 'EXECUTE ' + name, 'Public change set not approved')
        r = helper.Release(); r.execute('public', True)
    r = helper.Release(); r.arm(True, True)
    require(r.http('GET', '/register') == 200, 'Public AWS registration page failed')
    r.isolation(); r.schedules_off()
    (HERE / 'newsletter-release.json').write_text(json.dumps(marker(r), indent=2) + '\n')
    print('PUBLIC SIGNUP OPEN; weekly remains OFF. No Git operation performed. After explicit commit/push approval, apply website-activation.patch in the website repository, copy newsletter-release.json to public/, and deploy those two files. Then run this script with weekly --website-sha <deployed-commit>.')


def activate_weekly(helper, website_sha, approve=input):
    r = helper.Release()
    require(not r.state.get('weeklyExecutionStarted'), 'Prior weekly execution exists; inspect it, never replay an uncertain execution')
    require(r.activation_allowed() and r.state.get('deployedPhase') == 'public', 'Complete separately approved public activation first')
    r.readiness(False, False); r.finish(); verify_website(r, website_sha)
    require(approve('Attest the supplied website SHA is deployed; type PREPARE VERIFIED WEEKLY: ').strip() == 'PREPARE VERIFIED WEEKLY', 'Weekly preparation not approved')
    r.prepare_weekly(website_sha, True)
    changes = json.loads((HERE / 'weekly-change-set-review.json').read_text()); print(json.dumps(changes, indent=2))
    require(approve('Review BOTH exact change sets; type ENABLE VERIFIED WEEKLY: ').strip() == 'ENABLE VERIFIED WEEKLY', 'Weekly execution not approved')
    r = helper.Release(); verify_website(r, website_sha); r.execute_weekly(True)


def main():
    raise RuntimeError('Historical BASE-only activation is disabled after the PATCHED API deployment; a separately tested version-aware replacement is required')
    os.umask(0o077)
    import fcntl
    lock = os.open('/tmp/chronoverse-newsletter-v2-private-release.lock', os.O_CREAT | os.O_WRONLY, 0o600)
    try: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError: raise RuntimeError('Another release process is running')
    for line in (HERE / 'SHA256SUMS').read_text().splitlines():
        expected, name = line.split('  ', 1)
        require(pathlib.PurePosixPath(name).name == name and '\\' not in name and hashlib.sha256((HERE/name).read_bytes()).hexdigest() == expected, 'Release checksum mismatch')
    spec = importlib.util.spec_from_file_location('verified_release', HERE / 'cloudshell-release.py')
    helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
    parser = argparse.ArgumentParser(); parser.add_argument('phase', choices=['public', 'weekly']); parser.add_argument('--website-sha')
    args = parser.parse_args()
    r = helper.Release()
    if r.state.get('weeklyActivated'):
        helper.audience.verify(r)
        require(r.control().get('deliveryEnabled') is True, 'Activated release was paused; inspect before changing anything')
        print('Already activated; no signup, campaign, Git operation or schedule execution repeated.'); return
    try:
        if args.phase == 'public': activate_public(helper)
        else: activate_weekly(helper, args.website_sha)
    except (Exception, KeyboardInterrupt):
        try:
            r = helper.Release()
            if r.state.get('weeklyExecutionStarted'): r.stop_weekly(True)
            r.close(True)
        except Exception: print('CLOSE FAILED: verify CONTROL enrollment/delivery false and both schedules disabled immediately.')
        raise


if __name__ == '__main__':
    try: main()
    except (Exception, KeyboardInterrupt) as error:
        print('STOP: ' + (str(error) if isinstance(error, RuntimeError) else type(error).__name__) + '. Inspect saved evidence; never resend or replay an uncertain execution.')
        raise SystemExit(1)
