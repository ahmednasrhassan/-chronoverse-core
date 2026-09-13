import type { Metadata } from "next";
import Link from "next/link";

import {
  InstitutionalPage,
  InstitutionalSection,
} from "@/components/content/InstitutionalPage";
import { LAUNCH_MARKETS_V1 } from "@/config/institutionalNavigation";
import { buildPublicPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Data Sources",
  description:
    "Learn how official ECB observations support Chronoverse's five launch products and where its normalization and analysis begin.",
  pathname: "/data-sources",
});

export default function DataSourcesPage() {
  return (
    <InstitutionalPage
      eyebrow="Source provenance"
      title="Data Sources"
      summary="The European Central Bank is the raw official provider for the five launch products; Chronoverse owns the separate normalization and intelligence layer."
    >
      <InstitutionalSection title="Launch universe">
        <p>
          Current launch coverage is limited to{" "}
          {LAUNCH_MARKETS_V1.map((market) => market.label).join(", ")}. No
          additional market is implied by historical editorial coverage or
          legacy code.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="European Central Bank observations">
        <p>
          EUR/USD, EUR/JPY, EUR/GBP, and EUR/CHF use European Central Bank daily
          reference-rate observations. €STR uses the European Central
          Bank&apos;s official €STR series.
        </p>
        <p>
          These sources provide official daily or reference observations. They
          are not real-time traded prices, streaming feeds, tick data,
          intraday data, or OHLC market bars.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Provider and Chronoverse boundaries">
        <p>
          The ECB is the source of the raw official observations. Chronoverse
          validates identity and timestamps, normalizes those observations, and
          produces the analytical presentation. Chronoverse transformations
          are independent and are not produced, endorsed, or warranted by the
          ECB.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Provenance and revisions">
        <p>
          Source identity, series identity, reference date, retrieval context,
          and availability should be read together. Upstream corrections,
          revisions, or gaps may change later analytical output.
        </p>
        <p>
          See <Link href="/freshness">Freshness &amp; Availability</Link> for
          cadence, coverage, and supported historical ranges.
        </p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
