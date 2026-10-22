import type { Metadata } from "next";
import Link from "next/link";

import {
  InstitutionalPage,
  InstitutionalSection,
} from "@/components/content/InstitutionalPage";
import { buildPublicPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Methodology",
  description:
    "How Chronoverse transforms official ECB market observations into bounded analytical evidence.",
  pathname: "/methodology",
});

export default function MethodologyPage() {
  return (
    <InstitutionalPage
      eyebrow="Research controls"
      title="Methodology"
      summary="Chronoverse transforms identified official observations into bounded analytical evidence while preserving source, timestamp, and availability context."
    >
      <InstitutionalSection title="Official source acquisition">
        <p>
          Launch inputs are official European Central Bank daily reference
          observations for EUR/USD, EUR/JPY, EUR/GBP, and EUR/CHF, plus the
          official €STR series. These are daily or reference observations, not
          streaming prices, ticks, intraday quotes, or OHLC bars.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Canonical normalization and provenance">
        <p>
          Chronoverse validates the expected product and series identity,
          normalizes source observations into a shared product model, and keeps
          the source reference date distinct from retrieval and page-render
          time. Raw ECB data remains provider data; the normalization,
          transformation, and intelligence layer is Chronoverse work.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Free Lite projection">
        <p>
          Free Lite presents a bounded projection of the canonical five-product
          analysis. Official source observations remain distinct from derived
          analytical output, and neither is a streaming market price.
        </p>
        <p>
          Historical charts and source-history coverage describe official daily
          or reference observations. Available source history does not imply
          that every analytical layer is part of the public Lite display.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Signals, risk, and evidence">
        <p>
          The analytical layer organizes technical evidence, signal state,
          risk context, and supporting or conflicting evidence into
          classifications. A module may be partial, degraded, or unavailable
          when its required evidence is missing; unavailable evidence is not
          silently replaced with an assumed value.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Interpretation limits">
        <p>
          Outputs are analytical classifications, not predictive certainty,
          guaranteed signals, backtested-performance claims, trade orders, or
          personalized instructions. Users remain responsible for evaluating
          assumptions, suitability, liquidity, and risk.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Related controls">
        <p>
          Read <Link href="/data-sources">Data Sources</Link>,{" "}
          <Link href="/freshness">Freshness &amp; Availability</Link>, and the{" "}
          <Link href="/disclaimer">Financial Information Disclaimer</Link>{" "}
          alongside the product output.
        </p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
