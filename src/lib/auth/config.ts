export class AuthConfigurationErrorV1 extends Error {
  readonly variableName: string;

  constructor(variableName: string) {
    super(`Missing required authentication configuration: ${variableName}.`);
    this.name = "AuthConfigurationErrorV1";
    this.variableName = variableName;
  }
}

export interface SupabasePublicConfigV1 {
  readonly url: string;
  readonly publishableKey: string;
}

interface SupabasePublicEnvironmentV1 {
  readonly NEXT_PUBLIC_SUPABASE_URL?: string;
  readonly NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
}

export function requireAuthEnvironmentValueV1(
  variableName: string,
  value: string | undefined,
): string {
  const normalized = value?.trim();

  if (!normalized) {
    throw new AuthConfigurationErrorV1(variableName);
  }

  return normalized;
}

/** Public values only; safe for the future browser authentication boundary. */
export function getSupabasePublicConfigV1(
  environment?: SupabasePublicEnvironmentV1,
): SupabasePublicConfigV1 {
  const source = environment ?? {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };

  return Object.freeze({
    url: requireAuthEnvironmentValueV1(
      "NEXT_PUBLIC_SUPABASE_URL",
      source.NEXT_PUBLIC_SUPABASE_URL,
    ),
    publishableKey: requireAuthEnvironmentValueV1(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  });
}
