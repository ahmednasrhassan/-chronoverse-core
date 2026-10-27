import { managementGet, managementPost } from "@/lib/newsletterAws/redirect";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => managementGet(request, "unsubscribe");
export const POST = (request: Request) => managementPost(request, "unsubscribe");
