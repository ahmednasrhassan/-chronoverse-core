import { permanentRedirect } from "next/navigation";

export default function LegacyGoldMarketPage() {
  permanentRedirect("/markets");
}
