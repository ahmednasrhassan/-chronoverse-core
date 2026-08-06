import { redirect } from "next/navigation";

// Legacy misspelled route retained for backwards compatibility with any
// external/inbound links; redirects permanently to the correct URL.
export default function LegacyEditorialPolicyRedirect() {
  redirect("/editorial-policy");
}
