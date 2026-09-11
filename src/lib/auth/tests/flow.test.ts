import { AuthSessionMissingError } from "@supabase/supabase-js";

import {
  handleAuthConfirmationV1,
  requestEmailOtpV1,
  signOutAndGetDestinationV1,
} from "../flow";
import { loadAccountShellStateV1 } from "../account";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

async function verifyOtpRequest(): Promise<void> {
  const formData = new FormData();
  formData.set("email", " reader@example.com ");
  formData.set("redirectTo", "https://attacker.example/collect");
  const receivedCredentials: Array<Parameters<
    Parameters<typeof requestEmailOtpV1>[1]
  >[0]> = [];
  const result = await requestEmailOtpV1(
    formData,
    async (credentials) => {
      receivedCredentials.push(credentials);
      return { error: null };
    },
    { NEXT_PUBLIC_SITE_URL: "https://chronoversecapital.com/untrusted-path" },
  );

  assertEqual(result.status, "success", "valid email receives generic success");
  const credentials = receivedCredentials[0];

  assertEqual(credentials?.email, "reader@example.com",
    "OTP email is normalized");
  assertEqual(
    credentials?.options.emailRedirectTo,
    "https://chronoversecapital.com/auth/confirm",
    "OTP uses the configured origin and fixed callback path",
  );
  assertEqual(
    credentials?.options.emailRedirectTo.includes("attacker.example"),
    false,
    "arbitrary redirect form data is ignored",
  );
}

async function verifyCallback(): Promise<void> {
  let exchangedCode: string | null = null;
  const success = await handleAuthConfirmationV1(
    new Request(
      "https://chronoversecapital.com/auth/confirm" +
        "?code=supabase-code&next=https://attacker.example",
    ),
    async (code) => {
      exchangedCode = code;
      return { error: null };
    },
  );

  assertEqual(exchangedCode, "supabase-code", "callback exchanges Supabase code");
  assertEqual(success.status, 303, "successful callback uses redirect response");
  assertEqual(success.headers.get("location"),
    "https://chronoversecapital.com/account",
    "successful callback redirects only to Account");

  const malformed = await handleAuthConfirmationV1(
    new Request("https://chronoversecapital.com/auth/confirm?next=https://attacker.example"),
    async () => {
      throw new Error("missing callback must not exchange");
    },
  );
  assertEqual(malformed.headers.get("location"),
    "https://chronoversecapital.com/account?authError=callback",
    "malformed callback uses safe visible error state");

  const failed = await handleAuthConfirmationV1(
    new Request("https://chronoversecapital.com/auth/confirm?code=expired"),
    async () => ({ error: new Error("private provider detail") }),
  );
  assertEqual(failed.headers.get("location"),
    "https://chronoversecapital.com/account?authError=callback",
    "failed exchange does not expose provider details");
}

async function verifySignOut(): Promise<void> {
  let calls = 0;
  const destination = await signOutAndGetDestinationV1(async () => {
    calls += 1;
    return { error: null };
  });

  assertEqual(calls, 1, "sign-out calls the Supabase boundary once");
  assertEqual(destination, "/account", "successful sign-out returns Account");
}

async function verifyAccountStates(): Promise<void> {
  const anonymous = await loadAccountShellStateV1({
    loadIdentity: async () => ({
      data: { user: null },
      error: new AuthSessionMissingError(),
    }),
    resolveAccess: async () => ({
      state: "anonymous_free",
      isAuthenticated: false,
      authSubject: null,
      userId: null,
      role: null,
      canAccessVip: false,
    }),
  });
  assertEqual(anonymous.identityStatus, "signed_out",
    "anonymous Account state is signed out");
  assertEqual(anonymous.accessState, "anonymous_free",
    "anonymous Account state remains Free");

  const providerFailure = await loadAccountShellStateV1({
    loadIdentity: async () => ({
      data: { user: null },
      error: new Error("auth provider unavailable"),
    }),
    resolveAccess: async () => ({
      state: "anonymous_free",
      isAuthenticated: false,
      authSubject: null,
      userId: null,
      role: null,
      canAccessVip: false,
    }),
  });
  assertEqual(providerFailure.identityStatus, "unavailable",
    "genuine auth provider failure remains unavailable");
  assertEqual(providerFailure.accessState, "anonymous_free",
    "auth provider failure does not fabricate elevated access");

  const authenticated = await loadAccountShellStateV1({
    loadIdentity: async () => ({
      data: { user: { email: "reader@example.com" } },
      error: null,
    }),
    resolveAccess: async () => ({
      state: "authenticated_free",
      isAuthenticated: true,
      authSubject: "verified-subject",
      userId: "internal-user",
      role: "user",
      canAccessVip: false,
    }),
  });
  assertEqual(authenticated.identityStatus, "signed_in",
    "authenticated Account state is signed in");
  assertEqual(authenticated.email, "reader@example.com",
    "authenticated Account shows safe identity email");
  assertEqual(authenticated.accessState, "authenticated_free",
    "authenticated user remains Free");

  const unavailable = await loadAccountShellStateV1({
    loadIdentity: async () => ({
      data: { user: { email: "reader@example.com" } },
      error: null,
    }),
    resolveAccess: async () => {
      throw new Error("migration unavailable");
    },
  });
  assertEqual(unavailable.identityStatus, "signed_in",
    "identity remains truthful when trusted access is unavailable");
  assertEqual(unavailable.accessState, "unavailable",
    "access failure never grants an entitlement");
}

async function main(): Promise<void> {
  await verifyOtpRequest();
  await verifyCallback();
  await verifySignOut();
  await verifyAccountStates();

  console.log("PASS: passwordless auth flow and Account shell");
}

void main();
