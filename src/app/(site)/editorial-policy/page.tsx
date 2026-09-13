import type { Metadata } from "next";
import Link from "next/link";

import {
  InstitutionalPage,
  InstitutionalSection,
} from "@/components/content/InstitutionalPage";

export const metadata: Metadata = {
  title: "Editorial Policy",
  description:
    "Chronoverse Capital's standards for sourcing, editorial independence, assisted tools, and corrections.",
};

export default function EditorialPolicyPage() {
  return (
    <InstitutionalPage
      eyebrow="Governance and standards"
      title="Editorial Policy"
      summary="These standards govern the sourcing, disclosure, visual treatment, publication responsibility, and correction of Chronoverse research and analytical content."
    >
      <p className="text-xs font-mono text-muted">
        Last updated: September 2026
      </p>

      <InstitutionalSection title="Source attribution">
        <p>
          Published work should identify material sources and distinguish
          sourced facts, analytical interpretation, and hypothetical
          scenarios. Dates, figures, and attributed claims should be checked
          against the source available to the author or editor at publication.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Assisted tools and responsibility">
        <p>
          Tools may assist with drafting, summarization, formatting, analysis,
          or visual production. Tool output is not evidence by itself. The
          identified author or editor remains responsible for material selected
          for publication and should not present unsupported generated claims
          as verified facts.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Editorial and commercial separation">
        <p>
          Sponsorship, affiliate, or other commercial relationships should be
          disclosed where relevant and remain separate from editorial
          conclusions. They do not determine Free Lite intelligence, VIP Deep
          intelligence, analytical outputs, or the five-product launch scope.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Visual integrity">
        <p>
          Images are illustrative unless their context identifies them as
          documentary source material. Captions, alternative text, and
          metadata should not invent provenance or describe an image more
          specifically than the available source supports.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Corrections">
        <p>
          Readers can report a possible error through{" "}
          <Link href="/contact">Contact</Link>. A confirmed correction should
          preserve the distinction between the original source, editorial
          interpretation, and revised material.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Publication boundary">
        <p>
          Publication reflects responsibility for the material actually
          released. This policy does not claim that every item receives a named
          reviewer, a fixed multi-stage review, or a universal imagery audit.
        </p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
