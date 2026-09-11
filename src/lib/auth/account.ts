import type { AccessResultV1, AccessState } from "./types";

export type AccountIdentityStatusV1 =
  | "signed_in"
  | "signed_out"
  | "unavailable";

export interface AccountShellStateV1 {
  readonly identityStatus: AccountIdentityStatusV1;
  readonly email: string | null;
  readonly accessState: AccessState | "unavailable";
  readonly access: AccessResultV1 | null;
}

interface IdentityResultV1 {
  readonly data: {
    readonly user: { readonly email?: string | null } | null;
  };
  readonly error: unknown;
}

interface AccountShellDependenciesV1 {
  readonly loadIdentity: () => PromiseLike<IdentityResultV1>;
  readonly resolveAccess: () => PromiseLike<AccessResultV1>;
}

/** Resolves identity and trusted access independently so DB outages stay honest. */
export async function loadAccountShellStateV1(
  dependencies: AccountShellDependenciesV1,
): Promise<AccountShellStateV1> {
  const [identityResult, accessResult] = await Promise.allSettled([
    dependencies.loadIdentity(),
    dependencies.resolveAccess(),
  ]);
  const identity = identityResult.status === "fulfilled" &&
      !identityResult.value.error
    ? identityResult.value.data.user
    : undefined;
  const access = accessResult.status === "fulfilled"
    ? accessResult.value
    : null;
  const hasVerifiedIdentity = identity !== null && identity !== undefined;
  const hasVerifiedAccess = access?.isAuthenticated === true;
  const identityStatus = hasVerifiedIdentity || hasVerifiedAccess
    ? "signed_in"
    : identity === null
    ? "signed_out"
    : "unavailable";
  const accessIsConsistent = access !== null &&
    access.isAuthenticated === (identityStatus === "signed_in");

  return Object.freeze({
    identityStatus,
    email: hasVerifiedIdentity && typeof identity.email === "string"
      ? identity.email
      : null,
    accessState: accessIsConsistent ? access.state : "unavailable",
    access: accessIsConsistent ? access : null,
  });
}
