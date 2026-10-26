import { createService } from "./service.mjs";
import { createAwsDependencies } from "./aws.mjs";

export function createHandlers(service, env) {
  async function batch(event, expectedArn, process) {
    if (!Array.isArray(event.Records) || !event.Records.length || !expectedArn) throw new Error("invalid_event");
    const failures = [];
    for (const record of event.Records) {
      if (record.eventSourceARN !== expectedArn || record.eventSource !== "aws:sqs") throw new Error("untrusted_queue");
      try { await process(JSON.parse(record.body)); } catch { service.failure(); failures.push({ itemIdentifier: record.messageId }); }
    }
    return { batchItemFailures: failures };
  }
  return {
    api: event => service.api(event),
    planner: (event, context) => event.Records ? batch(event, env.PLAN_QUEUE_ARN, job => service.plan(job, context)) :
      (event.kind === "weekly" ? service.plan(event, context) : Promise.reject(new Error("invalid_event"))),
    worker: event => batch(event, env.DIGEST_QUEUE_ARN, job => service.deliver(job)),
    feedback: event => batch(event, env.FEEDBACK_QUEUE_ARN, envelope => service.feedback(envelope)),
    contacts: async event => {
      if (!Array.isArray(event.Records) || !env.TABLE_STREAM_ARN) throw new Error("invalid_event");
      const batchItemFailures = [];
      for (const record of event.Records) {
        if (record.eventSourceARN !== env.TABLE_STREAM_ARN || record.eventSource !== "aws:dynamodb") throw new Error("untrusted_stream");
        const pk = record.dynamodb?.Keys?.pk?.S;
        if (!/^SUB#[a-f0-9]{64}$/.test(pk || "") || !["INSERT", "MODIFY"].includes(record.eventName)) continue;
        try { await service.sync(pk.slice(4)); } catch { service.failure(); batchItemFailures.push({ itemIdentifier: record.dynamodb.SequenceNumber }); }
      }
      return { batchItemFailures };
    },
  };
}
let runtime;
function getRuntime() { return runtime ??= createHandlers(createService(createAwsDependencies(process.env), process.env), process.env); }
export const api = event => getRuntime().api(event);
export const planner = (event, context) => getRuntime().planner(event, context);
export const worker = event => getRuntime().worker(event);
export const feedback = event => getRuntime().feedback(event);
export const contacts = event => getRuntime().contacts(event);
