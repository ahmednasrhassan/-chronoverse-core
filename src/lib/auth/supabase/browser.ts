"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublicConfigV1 } from "../config";

/** Creates the cookie-aware public client used by future passwordless UI. */
export function createSupabaseBrowserClientV1() {
  const config = getSupabasePublicConfigV1();

  return createBrowserClient(config.url, config.publishableKey);
}
