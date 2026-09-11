import {
  handleEstrIntelligenceGetV1,
} from "@/lib/markets/assets/estr/apiResponse";

/** Server-side €STR intelligence endpoint backed only by the production runtime. */
export async function GET(): Promise<Response> {
  return handleEstrIntelligenceGetV1();
}
