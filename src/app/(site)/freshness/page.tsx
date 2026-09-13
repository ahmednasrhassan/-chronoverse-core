import type { Metadata } from "next";

import {
  InstitutionalPage,
  InstitutionalSection,
} from "@/components/content/InstitutionalPage";

export const metadata: Metadata = {
  title: "Freshness & Availability",
  description: "How Chronoverse communicates data freshness and service availability.",
};

const RANGE_ROWS = [
  { range: "1D", fx: "Unsupported", estr: "Unsupported" },
  { range: "5D", fx: "Conditional", estr: "Conditional" },
  { range: "1M", fx: "Supported", estr: "Supported" },
  { range: "3M", fx: "Supported", estr: "Supported" },
  { range: "6M", fx: "Supported", estr: "Supported" },
  { range: "1Y", fx: "Supported", estr: "Supported" },
  { range: "2Y", fx: "Supported", estr: "Supported" },
  { range: "5Y", fx: "Unsupported", estr: "Supported" },
  {
    range: "MAX",
    fx: "Unsupported",
    estr: "Official history since inception",
  },
] as const;

export default function FreshnessPage() {
  return (
    <InstitutionalPage
      eyebrow="Operational disclosure"
      title="Freshness & Availability"
      summary="Chronoverse uses official daily or reference observations. Timestamps, freshness labels, and coverage states describe the evidence available; they do not promise live delivery."
    >
      <InstitutionalSection title="Cadence and timestamps">
        <p>
          FX values are ECB daily reference-rate observations. €STR values are
          observations from the ECB&apos;s official €STR series. A source
          reference date identifies the observation; retrieval time and
          page-render time describe different events and should not be treated
          as the market reference time.
        </p>
        <p>
          Current product provenance may report freshness as{" "}
          <strong className="text-primary">not-assessed</strong>. That label is
          intentionally not strengthened without an implemented assessment.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Publication gaps">
        <p>
          Weekends, holidays, and other official non-publication dates are not
          filled with synthetic observations. An official series can therefore
          contain calendar gaps without implying that an intraday price is
          missing.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Coverage and availability">
        <p>
          Requested coverage is the calendar window selected by the user.
          Observed coverage is the official data actually available inside that
          window. Results may be marked partial or unavailable when the source
          does not cover the full request or a required module cannot be
          verified.
        </p>
        <p>
          A conditional 5D range is available only when at least two official
          observations exist in its exact window. Chronoverse does not remap an
          unsupported range to a different period.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Current historical range support">
        <div className="max-w-full overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-left text-sm">
            <caption className="sr-only">
              Historical range support for launch FX products and €STR
            </caption>
            <thead>
              <tr className="border-b border-border text-primary">
                <th scope="col" className="px-3 py-3 font-semibold">
                  Range
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  EUR FX products
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  €STR
                </th>
              </tr>
            </thead>
            <tbody>
              {RANGE_ROWS.map((row) => (
                <tr key={row.range} className="border-b border-border/70">
                  <th
                    scope="row"
                    className="whitespace-nowrap px-3 py-3 font-mono font-medium text-primary"
                  >
                    {row.range}
                  </th>
                  <td className="px-3 py-3">{row.fx}</td>
                  <td className="px-3 py-3">{row.estr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </InstitutionalSection>

      <InstitutionalSection title="Decision boundary">
        <p>
          Data and analysis may be delayed, incomplete, revised, partial, or
          unavailable. Verify current conditions through suitable primary
          sources before making a decision; historical availability does not
          guarantee future continuity.
        </p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
