import {
  getFiveProductVipDeepResponseV1,
} from "@/lib/markets/services/vipDeepDelivery";

/** Returns VIP Deep only after trusted access authorization. */
export async function GET(): Promise<Response> {
  return getFiveProductVipDeepResponseV1("eurchf");
}
