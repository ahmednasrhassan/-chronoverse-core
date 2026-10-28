"""Owner-run private repair only: no public activation, website push or schedule enable."""
import importlib.util, json, os, pathlib

HERE = pathlib.Path(__file__).resolve().parent

def require(ok, message):
    if not ok: raise RuntimeError(message)

def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    result = importlib.util.module_from_spec(spec); spec.loader.exec_module(result); return result

def review(helper, phase):
    r = helper.Release()
    if r.state.get('deployedPhase') == phase: return
    r.prepare(phase, True)
    changes = json.loads((HERE / 'change-set-review.json').read_text()); print(json.dumps(changes, indent=2))
    name = changes['ChangeSetName']
    require(input('Review actual changes; type EXECUTE ' + name + ': ').strip() == 'EXECUTE ' + name, 'Change set not approved')
    helper.Release().execute(phase, True)

def main():
    os.umask(0o077)
    import fcntl
    lock = os.open('/tmp/chronoverse-newsletter-v2-private-release.lock', os.O_CREAT | os.O_WRONLY, 0o600)
    try: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError: raise RuntimeError('Another private repair is running; no concurrent signup')
    # Verify executable files before importing them.
    import hashlib
    for line in (HERE / 'SHA256SUMS').read_text().splitlines():
        expected, name = line.split('  ', 1)
        require(pathlib.PurePosixPath(name).name == name and '\\' not in name and hashlib.sha256((HERE/name).read_bytes()).hexdigest() == expected, 'Release checksum mismatch')
    helper = module('private_release', 'cloudshell-release.py')
    recovery = module('signup_recovery', 'recover-private-signup.py')
    try:
        r = helper.Release()
        require(r.meta.get('privateSignupRepair') is True, 'Not a private repair artifact')
        r.close(True)
        if not r.state.get('importedCheckpoint'):
            recovery.import_checkpoint(r, input('Absolute directory of the ORIGINAL failed extracted release (containing its hidden checkpoint): ').strip())
        if r.state.get('testPassed'):
            print('Private tests already complete; registration/confirmation CLOSED, weekly OFF. No request repeated. Use run-verified-activation.py public only for separately approved activation.'); return
        if not r.state.get('deployedPhase'): review(helper, 'disabled')
        r = helper.Release(); r.readiness(False, False)
        if r.state.get('deployedPhase') != 'test': review(helper, 'test')
        r = helper.Release()
        if not r.state.get('confirmationClaim'):
            require(not r.state.get('recoveryConsumed'), 'Recovery request already consumed/uncertain; inspect saved HTTP status and immutable evidence. No automatic resend.')
            recovery.secure_routes(r, True)
            if not r.state.get('recoveryAuthorized'): recovery.authorize(r, True)
            r.arm(False, True); r.signup(True)
        elif r.control().get('registrationEnabled') is False:
            r.arm(False, True)
        if not r.state.get('confirmedObserved'):
            require(input('Observe actual confirmation email, verify GET does not confirm, deliberately POST confirmation. Type EMAIL CONFIRMED: ').strip() == 'EMAIL CONFIRMED', 'Inbox/confirmation incomplete; no resend')
            r.confirmed(True)
        if not r.state.get('unsubscribeObserved'): r.unsubscribe(True)
        if not r.state.get('feedbackMessageId') or not r.state.get('bounceFeedbackMessageId'): r.feedback_test(True)
        require(input('Allow managed Delivery/feedback/contact processing. Type VERIFY FEEDBACK: ').strip() == 'VERIFY FEEDBACK', 'Feedback pending')
        r.finish(); r.close(True)
        receipt = {'releaseId': r.meta['releaseId'], 'runtimeSha256': r.meta['runtimeSha256'], 'privateTestsPassed': True,
            'confirmationDelivery': 'VERIFIED', 'unsubscribe': 'SUPPRESSED', 'oneClickUnsubscribe': 'VERIFIED', 'feedback': 'SYNTHETIC_SNS_SQS_COMPLAINT_AND_PERMANENT_BOUNCE_VERIFIED',
            'publicRegistration': 'CLOSED', 'confirmation': 'CLOSED', 'weeklyDelivery': 'DISABLED', 'websitePublished': False}
        (HERE / 'PRIVATE-REPAIR-RECEIPT.json').write_text(json.dumps(receipt, indent=2)+'\n')
        print(json.dumps(receipt, indent=2))
        print('Private verification complete. To request separate public activation approval: python3 ' + str(HERE / 'run-verified-activation.py') + ' public')
    except (Exception, KeyboardInterrupt):
        try: helper.Release().close(True)
        except Exception: print('CLOSE FAILED: operator must verify CONTROL enrollment false and schedules disabled immediately.')
        raise

if __name__ == '__main__':
    try: main()
    except (Exception, KeyboardInterrupt) as error:
        print('STOP: ' + (str(error) if isinstance(error, RuntimeError) else type(error).__name__) + '. No automatic resend, public activation, website push or schedule enable.')
        raise SystemExit(1)
