import {
  handleEstrIntelligenceGetV1,
} from "@/lib/markets/assets/estr/apiResponse";
import {
  getCanonicalProductResultV1,
} from "@/lib/markets/services/canonicalProductResults";

/** Server-side €STR endpoint backed by the shared canonical result owner. */
export async function GET(): Promise<Response> {
  return handleEstrIntelligenceGetV1(
    () => getCanonicalProductResultV1("estr"),
  );
}
