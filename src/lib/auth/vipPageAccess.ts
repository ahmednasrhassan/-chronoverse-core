import "server-only";

import {
  AccessGuardErrorV1,
  type VipAuthorizedAccessV1,
} from "./guards";

export type RequireVipAccessV1 = () => Promise<VipAuthorizedAccessV1>;
export type RedirectVipPageV1 = (destination: string) => never;

/** Maps typed guard denials without rendering any protected page content. */
export async function enforceVipPageAccessV1(
  requireVip: RequireVipAccessV1,
  redirectTo: RedirectVipPageV1,
): Promise<VipAuthorizedAccessV1> {
  try {
    return await requireVip();
  } catch (error) {
    if (error instanceof AccessGuardErrorV1) {
      if (error.code === "authentication-required") {
        redirectTo("/account");
      }

      if (error.code === "vip-required") {
        redirectTo("/pricing");
      }
    }

    throw error;
  }
}
