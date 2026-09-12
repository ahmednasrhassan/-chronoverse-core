import { handleLemonWebhookIngressV1 } from "@/lib/billing/lemonWebhookIngress";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleLemonWebhookIngressV1(request);
}
