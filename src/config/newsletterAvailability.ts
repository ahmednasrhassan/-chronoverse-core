// Temporary code-level pause. Reactivation requires a reviewed code change;
// environment variables cannot reopen public signup.
export const NEWSLETTER_SIGNUPS_PAUSED = true;
// Fixed AWS management/API origin. Registration is signed server-side; browsers
// must not navigate directly to its private AWS_IAM registration routes.
export const NEWSLETTER_AWS_ORIGIN = "https://lh71lvbqi8.execute-api.eu-north-1.amazonaws.com";
export const NEWSLETTER_REGISTER_URL = `${NEWSLETTER_AWS_ORIGIN}/register`;
export const NEWSLETTER_SIGNUP_PAUSE_MESSAGE =
  "Newsletter subscriptions are temporarily unavailable. Please check back soon.";
