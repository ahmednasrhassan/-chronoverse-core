import { notFound, permanentRedirect } from "next/navigation";

import { isFreeOnlyMode } from "@/config/siteAvailability";

export default function LegacyPremiumPage() {
  if (isFreeOnlyMode()) notFound();
  permanentRedirect("/pricing");
}
