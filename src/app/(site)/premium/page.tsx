import { permanentRedirect } from "next/navigation";

export default function LegacyPremiumPage() {
  permanentRedirect("/pricing");
}
