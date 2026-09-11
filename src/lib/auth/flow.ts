export const ACCOUNT_PATH_V1 = "/account" as const;
export const AUTH_CONFIRM_PATH_V1 = "/auth/confirm" as const;

export interface EmailOtpRequestStateV1 {
  readonly status: "idle" | "success" | "error";
  readonly message: string | null;
}

export const INITIAL_EMAIL_OTP_STATE_V1: EmailOtpRequestStateV1 =
  Object.freeze({ status: "idle", message: null });

interface SiteEnvironmentV1 {
  readonly NEXT_PUBLIC_SITE_URL?: string;
}

interface OtpResultV1 {
  readonly error: unknown;
}

interface ExchangeResultV1 {
  readonly error: unknown;
}

interface SignOutResultV1 {
  readonly error: unknown;
}

export type RequestOtpV1 = (credentials: {
  readonly email: string;
  readonly options: {
    readonly emailRedirectTo: string;
  };
}) => PromiseLike<OtpResultV1>;

export type ExchangeCodeV1 = (
  code: string,
) => PromiseLike<ExchangeResultV1>;

export type SignOutV1 = () => PromiseLike<SignOutResultV1>;

/** Builds the only allowed passwordless redirect from configured site origin. */
export function getEmailOtpRedirectUrlV1(
  environment: SiteEnvironmentV1 = {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  },
): string {
  const configuredUrl = environment.NEXT_PUBLIC_SITE_URL?.trim();

  if (!configuredUrl) {
    throw new Error("NEXT_PUBLIC_SITE_URL is not configured.");
  }

  let siteUrl: URL;

  try {
    siteUrl = new URL(configuredUrl);
  } catch {
    throw new Error("NEXT_PUBLIC_SITE_URL is invalid.");
  }

  const isLocalHttp = siteUrl.protocol === "http:" &&
    (siteUrl.hostname === "localhost" || siteUrl.hostname === "127.0.0.1" ||
      siteUrl.hostname === "[::1]");

  if ((siteUrl.protocol !== "https:" && !isLocalHttp) ||
    siteUrl.username.length > 0 || siteUrl.password.length > 0) {
    throw new Error("NEXT_PUBLIC_SITE_URL is invalid.");
  }

  return new URL(AUTH_CONFIRM_PATH_V1, siteUrl.origin).toString();
}

/** Executes a non-enumerating email OTP request at an injectable auth boundary. */
export async function requestEmailOtpV1(
  formData: FormData,
  requestOtp: RequestOtpV1,
  environment: SiteEnvironmentV1 = {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  },
): Promise<EmailOtpRequestStateV1> {
  const emailValue = formData.get("email");
  const email = typeof emailValue === "string" ? emailValue.trim() : "";

  if (!isPlausibleEmailV1(email)) {
    return {
      status: "error",
      message: "Enter a valid email address.",
    };
  }

  try {
    const result = await requestOtp({
      email,
      options: { emailRedirectTo: getEmailOtpRedirectUrlV1(environment) },
    });

    if (result.error) {
      return genericOtpError();
    }

    return {
      status: "success",
      message: "Check your email for a secure sign-in link.",
    };
  } catch {
    return genericOtpError();
  }
}

/** Exchanges only Supabase's code parameter and always returns a local URL. */
export async function handleAuthConfirmationV1(
  request: Request,
  exchangeCode: ExchangeCodeV1,
): Promise<Response> {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code")?.trim();
  let destination = `${ACCOUNT_PATH_V1}?authError=callback`;

  if (code) {
    try {
      const result = await exchangeCode(code);

      if (!result.error) {
        destination = ACCOUNT_PATH_V1;
      }
    } catch {
      // The Account page displays a generic callback error without internals.
    }
  }

  return Response.redirect(new URL(destination, requestUrl.origin), 303);
}

/** Clears the real Supabase session and returns a fixed local destination. */
export async function signOutAndGetDestinationV1(
  signOut: SignOutV1,
): Promise<string> {
  try {
    const result = await signOut();
    return result.error
      ? `${ACCOUNT_PATH_V1}?authError=signout`
      : ACCOUNT_PATH_V1;
  } catch {
    return `${ACCOUNT_PATH_V1}?authError=signout`;
  }
}

function isPlausibleEmailV1(value: string): boolean {
  return value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function genericOtpError(): EmailOtpRequestStateV1 {
  return {
    status: "error",
    message: "We could not send a sign-in link. Please try again shortly.",
  };
}
