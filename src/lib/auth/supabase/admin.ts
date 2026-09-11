import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseAdminConfigV1 } from "../serverConfig";

/** Elevated client for explicit trusted server administration paths only. */
export function createSupabaseAdminClientV1() {
  const config = getSupabaseAdminConfigV1();

  return createClient(config.url, config.secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
