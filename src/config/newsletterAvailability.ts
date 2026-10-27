// Temporary code-level pause. Reactivation requires a reviewed code change;
// environment variables cannot reopen public signup.
export const NEWSLETTER_SIGNUPS_PAUSED = true;
// Public origin is fixed, contains no credential and is not a Vercel bridge.
export const NEWSLETTER_AWS_ORIGIN = "https://lh71lvbqi8.execute-api.eu-north-1.amazonaws.com";
export const NEWSLETTER_REGISTER_URL = `${NEWSLETTER_AWS_ORIGIN}/register`;
export const NEWSLETTER_SIGNUP_PAUSE_MESSAGE =
  "Newsletter signups are temporarily paused while delivery is suspended. No new subscriptions are being accepted.";
