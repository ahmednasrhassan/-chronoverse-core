import { sha } from "../src/model.mjs";
export const address = "synthetic@example.test", id = sha(address), time = "2026-10-24T12:00:00.000Z";
export const passphrase = "Synthetic-only test phrase not a real backup password";
export const config = { region: "eu-north-1", accountId: "111111111111", roleArn: "arn:aws:iam::111111111111:role/NewsletterBackupReadOnly", tableArn: "arn:aws:dynamodb:eu-north-1:111111111111:table/SyntheticLedger", contactList: "synthetic-weekly", awsExe: "C:\\Program Files\\Amazon\\AWSCLIV2\\aws.exe", auth: { kind: "login" }, maxSnapshots: 10 };
export function row(pk, fields = {}) { return Object.fromEntries(Object.entries({ pk, ...fields }).map(([k, v]) => [k, typeof v === "number" ? { N: String(v) } : typeof v === "boolean" ? { BOOL: v } : { S: v }])); }
export function data() {
  return { ledger: [row(`SUB#${id}`, { id, email: address, state: "CONFIRMED", confirmationNonce: "synthetic-nonce-never-export" }),
    row(`AUDIT#${id}#request#synthetic-nonce`, { kind: "requested", at: 1000, consentVersion: "weekly-research-v1", consentText: "Synthetic consent evidence", source: "synthetic-fixture" }),
    row(`AUDIT#${id}#confirm#synthetic-nonce`, { kind: "confirmed", at: 2000, consentVersion: "weekly-research-v1" })],
    contacts: [{ EmailAddress: address, TopicPreferences: [{ TopicName: "weekly-research", SubscriptionStatus: "OPT_IN" }], TopicDefaultPreferences: [{ TopicName: "weekly-research", SubscriptionStatus: "OPT_OUT" }] }],
    accountChecks: [{ email: address, suppressed: false }] };
}
export function source(d = data()) { return { async verify() {}, async scan() { return { Items: d.ledger }; }, async contacts() { return { Contacts: d.contacts }; }, async suppression() { return null; }, close() {} }; }
