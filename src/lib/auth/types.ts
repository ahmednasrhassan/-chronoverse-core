export const CHRONOVERSE_ROLES_V1 = Object.freeze([
  "user",
  "admin",
  "owner",
] as const);

export type ChronoverseRole = typeof CHRONOVERSE_ROLES_V1[number];

export const ACCESS_STATES_V1 = Object.freeze([
  "anonymous_free",
  "authenticated_free",
  "vip_active",
  "admin",
  "owner",
] as const);

export type AccessState = typeof ACCESS_STATES_V1[number];

export interface AnonymousAccessV1 {
  readonly state: "anonymous_free";
  readonly isAuthenticated: false;
  readonly authSubject: null;
  readonly userId: null;
  readonly role: null;
  readonly canAccessVip: false;
}

export interface AuthenticatedFreeAccessV1 {
  readonly state: "authenticated_free";
  readonly isAuthenticated: true;
  readonly authSubject: string;
  readonly userId: string;
  readonly role: "user";
  readonly canAccessVip: false;
}

export interface VipActiveAccessV1 {
  readonly state: "vip_active";
  readonly isAuthenticated: true;
  readonly authSubject: string;
  readonly userId: string;
  readonly role: "user";
  readonly canAccessVip: true;
}

export interface AdminAccessV1 {
  readonly state: "admin";
  readonly isAuthenticated: true;
  readonly authSubject: string;
  readonly userId: string;
  readonly role: "admin";
  readonly canAccessVip: true;
}

export interface OwnerAccessV1 {
  readonly state: "owner";
  readonly isAuthenticated: true;
  readonly authSubject: string;
  readonly userId: string;
  readonly role: "owner";
  readonly canAccessVip: true;
}

export type AuthenticatedAccessV1 =
  | AuthenticatedFreeAccessV1
  | VipActiveAccessV1
  | AdminAccessV1
  | OwnerAccessV1;

export type AccessResultV1 = AnonymousAccessV1 | AuthenticatedAccessV1;
