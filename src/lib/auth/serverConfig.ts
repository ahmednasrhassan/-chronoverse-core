import "server-only";

import {
  getSupabasePublicConfigV1,
  requireAuthEnvironmentValueV1,
} from "./config";

export interface SupabaseAdminConfigV1 {
  readonly url: string;
  readonly secretKey: string;
}

interface SupabaseAdminEnvironmentV1 {
  readonly NEXT_PUBLIC_SUPABASE_URL?: string;
  readonly NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly SUPABASE_SECRET_KEY?: string;
}

/** The elevated key is reachable only through this server-only module. */
export function getSupabaseAdminConfigV1(
  environment?: SupabaseAdminEnvironmentV1,
): SupabaseAdminConfigV1 {
  const source = environment ?? {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  };
  const publicConfig = getSupabasePublicConfigV1(source);

  return Object.freeze({
    url: publicConfig.url,
    secretKey: requireAuthEnvironmentValueV1(
      "SUPABASE_SECRET_KEY",
      source.SUPABASE_SECRET_KEY,
    ),
  });
}
