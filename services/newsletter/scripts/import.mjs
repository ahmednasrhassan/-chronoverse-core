import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { DynamoDBClient, DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { prepareMigration } from "../src/migration.mjs";

// No connection, credential lookup or side effect without every explicit argument.
// Input is a PRIVATE normalized export. Never put a real export in this repository.
async function main() {
const args = new Map(process.argv.slice(2).map(value => value.split(/=(.*)/s).slice(0, 2)));
if (!args.has("--input") || !args.has("--batch")) throw new Error("Use --input=PRIVATE_FILE --batch=ID; dry-run is the default. Output contains counts only.");
const raw = readFileSync(args.get("--input"));
const plan = prepareMigration(JSON.parse(raw), args.get("--batch"));
if (args.has("--apply-approved")) {
  const arn = args.get("--table-arn"); const region = args.get("--region");
  if (!/^arn:aws:dynamodb:[a-z0-9-]+:\d{12}:table\/[a-zA-Z0-9_.-]+$/.test(arn || "") || arn.split(":")[3] !== region ||
      createHash("sha256").update(raw).digest("hex") !== args.get("--input-sha256")) throw new Error("Explicit account/table/region and input hash are required before connecting");
  const client = new DynamoDBClient({ region }); const TableName = arn.split("/")[1];
  const described = await client.send(new DescribeTableCommand({ TableName }));
  if (described.Table?.TableArn !== arn) throw new Error("wrong_target_table");
  const ddb = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });
  // Reserve the batch identity before any record is changed. Conflicting reuse fails first.
  await ddb.send(new PutCommand({ TableName, Item: { pk: `MIGRATION-BATCH#${plan.batchId}`, digest: plan.planDigest, state: "IN_PROGRESS", sourceCount: plan.sourceCount, uniqueCount: plan.uniqueCount },
    ConditionExpression: "attribute_not_exists(pk) OR digest = :digest", ExpressionAttributeValues: { ":digest": plan.planDigest } }));
  for (const item of plan.items) {
    // Immutable provenance first. Failed restarts can be resumed safely.
    const audit = { ...item, pk: `MIGRATION#${plan.batchId}#${item.id}`, pkOriginal: item.pk };
    try { await ddb.send(new PutCommand({ TableName, Item: audit, ConditionExpression: "attribute_not_exists(pk)" })); }
    catch (e) { if (e.name !== "ConditionalCheckFailedException") throw new Error("migration_storage_failure"); }
    if (item.state === "SUPPRESSED") {
      await ddb.send(new UpdateCommand({ TableName, Key: { pk: item.pk }, UpdateExpression: "SET id = :id, #state = :state, suppressionReason = if_not_exists(suppressionReason, :reason), suppressedAt = if_not_exists(suppressedAt, :now)" + (item.email ? ", email = if_not_exists(email, :email)" : "") + " REMOVE audienceKey",
        ExpressionAttributeNames: { "#state": "state" }, ExpressionAttributeValues: { ":id": item.id, ":state": "SUPPRESSED", ":reason": "legacy-migration", ":now": Date.now(), ...(item.email ? { ":email": item.email } : {}) } }));
    } else {
      try { await ddb.send(new PutCommand({ TableName, Item: { pk: item.pk, id: item.id, email: item.email, state: "HOLD", migrationBatch: plan.batchId }, ConditionExpression: "attribute_not_exists(pk)" })); }
      catch (e) { if (e.name !== "ConditionalCheckFailedException") throw new Error("migration_storage_failure"); }
    }
  }
  await ddb.send(new UpdateCommand({ TableName, Key: { pk: `MIGRATION-BATCH#${plan.batchId}` }, UpdateExpression: "SET #state = :complete, completedAt = :now", ConditionExpression: "digest = :digest", ExpressionAttributeNames: { "#state": "state" }, ExpressionAttributeValues: { ":digest": plan.planDigest, ":complete": "COMPLETE", ":now": Date.now() } }));
}
console.log(JSON.stringify({ mode: args.has("--apply-approved") ? "applied" : "offline-dry-run", sourceCount: plan.sourceCount, uniqueCount: plan.uniqueCount, suppressed: plan.suppressedCount, held: plan.holdCount }));

}
main().catch(() => { console.error("Migration stopped safely; inspect input and scoped configuration privately. No mail was sent."); process.exitCode = 1; });
