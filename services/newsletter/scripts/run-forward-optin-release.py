"""One owner-run CloudShell cycle; no connectors, key recovery or automatic resend.

Run from the extracted immutable release directory. On an incomplete controlled
test, enrollment is closed and all evidence/suppressions remain intact.
"""
import hashlib, importlib.util, json, os, pathlib

HERE = pathlib.Path(__file__).resolve().parent

def require(ok, message):
    if not ok: raise RuntimeError(message)

def review(helper, phase):
    r = helper.Release()
    if r.state.get('deployedPhase') == phase: return
    r.prepare(phase, True)
    changes = json.loads((HERE / 'change-set-review.json').read_text())
    print(json.dumps(changes, indent=2))
    name = changes['ChangeSetName']
    require(input('Review actual changes; type EXECUTE ' + name + ': ').strip() == 'EXECUTE ' + name, 'Change set not approved')
    helper.Release().execute(phase, True)

def main():
    os.umask(0o077)
    # Keep canary intent/state writes serialized within this release directory.
    import fcntl
    lock_fd = os.open(HERE / '.release-owner.lock', os.O_WRONLY | os.O_CREAT, 0o600)
    try: fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError: raise RuntimeError('Another release process owns this directory; do not run a second controlled signup')
    for line in (HERE / 'SHA256SUMS').read_text().splitlines():
        expected, name = line.split('  ', 1)
        require(pathlib.PurePosixPath(name).name == name and '\\' not in name, 'Unsafe checksum path')
        require(hashlib.sha256((HERE / name).read_bytes()).hexdigest() == expected, 'Release checksum mismatch')
    spec = importlib.util.spec_from_file_location('verified_release', HERE / 'cloudshell-release.py')
    helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
    try:
        r = helper.Release()
        if r.state.get('weeklyActivated'):
            helper.audience.verify(r)
            require(r.control().get('deliveryEnabled') is True, 'Previously activated release is now paused; inspect before changing gates')
            print('This release is already activated. Preserve its receipt and existing subscribers; no signup or campaign was repeated.')
            return
        # An interrupted prior run may have left only enrollment open. Close
        # those gates before resuming its saved evidence; never reset a test row.
        if r.state.get('weeklyExecutionStarted'):
            raise RuntimeError('Prior weekly execution is uncertain. Inspect both recorded CloudFormation change sets and use stop-weekly --approve before preparing a reviewed recovery; never replay it blindly.')
        r.close(True)
        r.initialize_audience(True)
        if not r.state.get('deployedPhase'): review(helper, 'disabled')
        r = helper.Release()
        if not r.state.get('supportVerified'):
            require(input('Verify info@chronoversecapital.com is monitored and support verifies mailbox ownership before operator opt-out. Type SUPPORT READY: ').strip() == 'SUPPORT READY', 'Manual support path not operational')
        if not r.state.get('historicalFeedbackReconciled'):
            require(input('Verify all known suppression data/backlogs are retained and required feedback no longer targets the retired website. No unknown database recovery is required. Type FEEDBACK RECONCILED: ').strip() == 'FEEDBACK RECONCILED', 'Known suppression/feedback continuity unresolved')
        r.readiness(True, True)
        if not r.state.get('testPassed'):
            if r.state.get('deployedPhase') != 'test': review(helper, 'test')
            r = helper.Release()
            if r.control().get('registrationEnabled') is False: r.arm(False, True)
            if not r.state.get('signupAttempted'): r.signup(True)
            if not r.state.get('confirmedObserved'):
                require(input('Observe the actual confirmation email in the authorized inbox; verify GET does not confirm, then submit confirmation. Type EMAIL CONFIRMED: ').strip() == 'EMAIL CONFIRMED', 'Actual inbox/confirmation not verified; no resend')
                r.confirmed(True)
            if not r.state.get('unsubscribeObserved'): r.unsubscribe(True)
            if not r.state.get('feedbackMessageId'): r.feedback_test(True)
            require(input('Wait for managed feedback/contact processing. Type VERIFY FEEDBACK: ').strip() == 'VERIFY FEEDBACK', 'Feedback result still pending')
            r.finish(); r.close(True)
        if r.state.get('deployedPhase') != 'public': review(helper, 'public')
        r = helper.Release()
        if r.control().get('registrationEnabled') is False: r.arm(True, True)
        require(r.http('GET', '/register') == 200, 'Public AWS registration page failed')
        r.isolation(); r.schedules_off()
        receipt = {'releaseId': r.meta['releaseId'], 'runtimeSha256': r.meta['runtimeSha256'], 'enrollmentPolicy': helper.ENROLLMENT_POLICY,
            'audienceMode': 'FORWARD_ONLY_ZERO_CONFIRMED', 'historicalRecoveryStatus': helper.audience.STATUS,
            'audienceReceiptSha256': r.control()['forwardOnlyReceipt'],
            'historicalCount': r.state['historicalCount'], 'historicalBaselineSha256': r.state['historicalBaselineSha256'],
            'controlledTestPassed': r.state.get('testPassed') is True, 'publicRegisterHttpStatus': 200,
            'deliveryEnabled': r.control().get('deliveryEnabled'), 'schedules': 'DISABLED', 'websitePublished': False,
            'nextAction': 'Publish and verify the website link, then review future weekly/discovery change sets. No campaign is invoked.'}
        (HERE / 'AWS-RELEASE-RECEIPT.json').write_text(json.dumps(receipt, indent=2) + '\n')
        print(json.dumps(receipt, indent=2))
        spec = importlib.util.spec_from_file_location('verified_website', HERE / 'publish-verified-website.py')
        website = importlib.util.module_from_spec(spec); spec.loader.exec_module(website)
        website_sha = website.publish(r, HERE)
        r = helper.Release()
        if not r.state.get('weeklyPrepared'): r.prepare_weekly(website_sha, True)
        changes = json.loads((HERE / 'weekly-change-set-review.json').read_text())
        print(json.dumps(changes, indent=2))
        names = ','.join(change['name'] for change in changes)
        require(input('Review BOTH actual future schedule changes; type EXECUTE ' + names + ': ').strip() == 'EXECUTE ' + names, 'Weekly change sets not approved; delivery remains disabled')
        r.execute_weekly(True)
        receipt.update(websiteCommit=website_sha, websiteProductionVerified=True, weeklyActivated=True,
            weeklyNotBefore=r.state['weeklyNotBefore'], deliveryEnabled=True, schedules='ENABLED_WITH_FUTURE_START', websitePublished=True)
        receipt.pop('nextAction', None)
        (HERE / 'AWS-RELEASE-RECEIPT.json').write_text(json.dumps(receipt, indent=2) + '\n')
        print(json.dumps(receipt, indent=2))
    except (Exception, KeyboardInterrupt):
        # Never leave a failed private/public canary partially activated. Closing
        # touches only gates, not subscriber records, send claims or checkpoints.
        try:
            latest = helper.Release()
            if latest.state.get('weeklyExecutionStarted'): latest.stop_weekly(True)
            latest.close(True)
        except Exception: print('ENROLLMENT CLOSE NOT VERIFIED: run cloudshell-release.py close --approve and inspect CONTROL immediately')
        raise

if __name__ == '__main__':
    try: main()
    except Exception as error:
        print('STOP: ' + (str(error) if isinstance(error, RuntimeError) else type(error).__name__ + '; inspect privately, never retry an uncertain email'))
        raise SystemExit(1)
