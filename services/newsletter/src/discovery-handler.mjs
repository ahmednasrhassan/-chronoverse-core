import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { createPublicationStore, createPublicationObject } from "./publication-aws.mjs";
import { discoverPublications, queryPublications } from "./sanity-discovery.mjs";

export async function discover(event, context = {}) {
  if (event?.kind !== "sanity-discovery") throw new Error("invalid_event");
  const env = process.env, client = new DynamoDBClient({ region: env.AWS_REGION, maxAttempts: 3 });
  const ddb = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });
  const deadline = Date.now() + Math.min(90000, (context.getRemainingTimeInMillis?.() ?? 120000) - 15000);
  try {
    const result = await discoverPublications({ store: createPublicationStore(ddb, env.TABLE_NAME),
      object: createPublicationObject(env, client.config.credentials), query: (config, options) => queryPublications(config, options, fetch, { deadline }) }, env);
    console.log(JSON.stringify({ event: "publication-discovery", status: "complete", ...result }));
  } catch {
    console.error(JSON.stringify({ event: "publication-discovery", status: "held" }));
    throw new Error("publication_discovery_held");
  }
}
