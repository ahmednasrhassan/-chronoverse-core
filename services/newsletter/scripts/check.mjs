import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { validateAlarms } from "./validate-template.mjs";
for (const folder of ["src", "scripts", "test"]) {
  for (const file of readdirSync(new URL(`../${folder}/`, import.meta.url)).filter(x => x.endsWith(".mjs"))) {
    const result = spawnSync(process.execPath, ["--check", new URL(`../${folder}/${file}`, import.meta.url).pathname.replace(/^\/([A-Z]:)/i, "$1")], { encoding: "utf8", windowsHide: true });
    if (result.status !== 0) throw new Error(`Syntax failed: ${folder}/${file}`);
  }
}
const template = JSON.parse(readFileSync(new URL("../template.json", import.meta.url), "utf8"));
validateAlarms(template);
for (const name of ["DeliveryEnabled", "RegistrationEnabled", "ConfirmationEnabled", "LegacyDispatchRetired", "ComplianceApproved"]) assert.equal(template.Parameters[name].Default, "false");
assert.equal(template.Resources.Ledger.DeletionPolicy, "Retain");
assert.equal(template.Resources.Contacts.Properties.Topics[0].DefaultSubscriptionStatus, "OPT_OUT");
console.log("JavaScript syntax and infrastructure safety invariants passed (no AWS connection)");
