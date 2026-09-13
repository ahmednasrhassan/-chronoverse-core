import { permanentRedirect } from "next/navigation";

export default function LegacyBitcoinMarketPage() {
  permanentRedirect("/markets");
}
