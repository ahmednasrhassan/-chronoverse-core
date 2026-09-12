import { strict as assert } from "node:assert";

import { formatAccountAccessStateV1 } from "../account";

const expectedLabels = [
  ["anonymous_free", "Free — anonymous"],
  ["authenticated_free", "Free — authenticated"],
  ["vip_active", "VIP Active"],
  ["admin", "Administrator"],
  ["owner", "Owner"],
  ["unavailable", "Unavailable"],
] as const;

for (const [state, label] of expectedLabels) {
  assert.equal(formatAccountAccessStateV1(state), label);
}

console.log("PASS: account access status display labels");
