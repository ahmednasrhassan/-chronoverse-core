import { permanentRedirect } from "next/navigation";

export default function LegacySp500MarketPage() {
  permanentRedirect("/markets");
}
