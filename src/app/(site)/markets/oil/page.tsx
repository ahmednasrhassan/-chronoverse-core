import { permanentRedirect } from "next/navigation";

export default function LegacyOilMarketPage() {
  permanentRedirect("/reports");
}
