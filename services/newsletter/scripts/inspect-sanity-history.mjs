// Owner-authorized, read-only source inspection. Never print documents or tokens.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@sanity/client";
import { parse } from "dotenv";
import { createHash } from "node:crypto";

let stage = "configuration";
async function main() {
  const env = parse(readFileSync(".env.local"));
  const credentialSource = process.argv[2] || (env.SANITY_NEWSLETTER_READ_TOKEN ? "SANITY_NEWSLETTER_READ_TOKEN" : "SANITY_TOKEN");
  if (!["SANITY_NEWSLETTER_READ_TOKEN", "SANITY_TOKEN"].includes(credentialSource)) throw new Error("invalid_credential_name");
  const token = env[credentialSource];
  if (!token) throw new Error("source_read_credential_unavailable");
  const project = env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = env.NEXT_PUBLIC_SANITY_DATASET;
  if (project !== "xfs4j01p" || dataset !== "production") throw new Error("wrong_source");
  const client = createClient({ projectId: project, dataset, token, apiVersion: "2025-02-19", perspective: "raw", useCdn: false, timeout: 15000, maxRetries: 0 });
  stage = "type_inventory";
  const typeCounts = await client.fetch('array::unique(*[]._type)');
  stage = "dataset_inventory";
  const datasets = await client.datasets.list();
  async function snapshot() {
    const records = [];
    let after = "";
    for (;;) {
      const page = await client.fetch('*[_type in ["subscriber", "newsletterSuppression", "newsletterCampaign", "newsletterDelivery"] && _id > $after] | order(_id asc)[0...200]', { after });
      if (!Array.isArray(page)) throw new Error("invalid_source_page");
      if (!page.length) return records;
      if (!page.every(r => typeof r._id === "string" && r._id > after)) throw new Error("invalid_source_cursor");
      records.push(...page); after = page.at(-1)._id;
      if (records.length > 100000) throw new Error("source_too_large");
    }
  }
  stage = "newsletter_snapshot";
  const records = await snapshot(), second = await snapshot();
  const canonical = value => JSON.stringify(value, function (key, item) {
    if (item && typeof item === "object" && !Array.isArray(item)) return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b, "en")));
    return item;
  });
  if (canonical(records) !== canonical(second)) throw new Error("source_changed_during_inspection");
  const directory = resolve(".newsletter-private/sanity-history");
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, "snapshot.json"), JSON.stringify({ project, dataset, records }), { mode: 0o600 });
  const counts = Object.fromEntries(["subscriber", "newsletterSuppression", "newsletterCampaign", "newsletterDelivery"].map(type => [type, records.filter(r => r._type === type).length]));
  // Field names and aggregate counts only; no subscriber values are logged.
  const summary = { project, dataset, types: typeCounts, datasets: datasets.map(d => d.name), credentialSource, counts, subscriberFieldNames: [...new Set(records.filter(r => r._type === "subscriber").flatMap(Object.keys))].sort(), snapshotFileSha256: createHash("sha256").update(readFileSync(resolve(directory, "snapshot.json"))).digest("hex") };
  writeFileSync(resolve(directory, "inspection.json"), JSON.stringify(summary, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(summary));
}
main().catch(error => { console.error(JSON.stringify({ error: "sanity_history_read_failed", stage, status: error.statusCode ?? null, code: error.code ?? null })); process.exitCode = 1; });
