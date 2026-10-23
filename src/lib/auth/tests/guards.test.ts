import assert from "node:assert/strict";
import { test } from "node:test";
import { createAccessGuardsV1 } from "../guards";
import type { AccessResultV1 } from "../types";

test("authenticated guard preserves verified user, admin and owner identities", async () => {
  for (const [role, state, canAccessVip] of [["user", "authenticated_free", false], ["admin", "admin", true], ["owner", "owner", true]] as const) {
    const access: AccessResultV1 = { role, state, canAccessVip, isAuthenticated: true, authSubject: "verified-subject", userId: "internal-user" } as AccessResultV1;
    let calls = 0;
    const guards = createAccessGuardsV1(async () => { calls++; return access; });
    assert.equal(await guards.requireAuthenticated(), access);
    assert.equal(calls, 1);
    assert.equal("requireVip" in guards, false);
  }
});
test("anonymous and malformed identities fail closed and resolver failures propagate", async () => {
  const anonymous: AccessResultV1 = { state: "anonymous_free", isAuthenticated: false, authSubject: null, userId: null, role: null, canAccessVip: false };
  await assert.rejects(createAccessGuardsV1(async () => anonymous).requireAuthenticated, { code: "authentication-required" });
  const malformed = { ...anonymous, state: "owner" } as unknown as AccessResultV1;
  await assert.rejects(createAccessGuardsV1(async () => malformed).requireAuthenticated, { code: "access-invalid" });
  const failure = new Error("identity unavailable");
  await assert.rejects(createAccessGuardsV1(async () => { throw failure; }).requireAuthenticated, failure);
});
