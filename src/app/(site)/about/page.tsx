import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import {
  InstitutionalPage,
  InstitutionalSection,
} from "@/components/content/InstitutionalPage";
import { siteConfig } from "@/config/siteConfig";
import { buildPublicPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "About",
  description:
    "Learn about Chronoverse Capital's original software platform, independent research and editorial team.",
  pathname: "/about",
});

const ACTIVE_TEAM_MEMBERS = [
  {
    name: "Ahmed Sayed Younis",
    role: "Market analysis",
    description: "Contributes to market analysis and analytical review.",
    imageUrl:
      "https://cdn.sanity.io/images/xfs4j01p/production/be70d39bfca56986f8a16aee34afe753934009e9-896x1198.png?w=336&h=336&fit=crop&crop=center&auto=format&q=80",
  },
  {
    name: "Mohamed Younes",
    role: "Market analysis",
    description: "Contributes to market analysis and market interpretation.",
    imageUrl:
      "https://cdn.sanity.io/images/xfs4j01p/production/a198b6ca1d4adc3d8bc92b60f0cbe5422a313935-500x729.webp?w=336&h=336&fit=crop&crop=center&auto=format&q=80",
  },
  {
    name: "Heba Sayed Ahmed",
    role: "Market analysis and analytical review",
    description:
      "Contributes to market analysis, analytical review, and market interpretation.",
    imageUrl:
      "https://cdn.sanity.io/images/xfs4j01p/production/c9b34301e4a2b857b1878fd640c57e6396708422-1911x1856.webp?w=336&h=336&fit=crop&crop=center&auto=format&q=80",
  },
] as const;

export default function AboutPage() {
  return (
    <InstitutionalPage
      pathname="/about"
      eyebrow="Company"
      title="About Chronoverse Capital"
      summary="An independent, English-language platform for original downloadable software, supported by research on economics, finance and history."
    >
      <InstitutionalSection title="Original software, independent by design">
        <p>
          Chronoverse Capital is developing a focused platform for original
          downloadable software. Our{" "}
          <a href="https://apps.chronoversecapital.com/">
            applications catalog
          </a>{" "}
          is free to browse. No applications have been released yet; features,
          system requirements and availability will be published with each
          future release.
        </p>
        <p>
          We intend to publish purpose-built downloadable tools for focused
          work. The first product, categories and supported systems have not yet
          been confirmed. Independent articles and the research newsletter
          provide context and a broader perspective alongside the software
          platform.
        </p>
        <p>
          The catalog is separate from the{" "}
          <a href={siteConfig.storefrontUrl}>Gumroad storefront</a>. Future
          eligible releases will link to their verified Gumroad product pages.
          There is no software checkout, subscription or license system on this
          website.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Independent financial research">
        <p>
          Chronoverse Capital publishes financial research, market analysis, and
          economic commentary. Our <Link href="/reports">Research archive</Link>{" "}
          contains published articles and independent analysis.
        </p>
        <p>
          We distinguish source observations, analytical interpretation, and
          uncertainty so readers can assess the evidence behind each article.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Independent analytical position">
        <p>
          Chronoverse presents analytical evidence and classifications, not
          personalized advice, trade orders, or assured outcomes. Commercial
          arrangements do not determine our research or editorial conclusions.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Research contributors">
        <p>
          The following contributors are listed in Chronoverse&apos;s editorial
          profiles for market analysis, review and interpretation. These
          profiles describe research contributions, not investment advisory
          services.
        </p>
        <ul className="grid gap-4 pt-2 md:grid-cols-3">
          {ACTIVE_TEAM_MEMBERS.map((member) => (
            <li
              key={member.name}
              className="flex flex-col items-center rounded-lg border border-border bg-background/40 p-5 text-center"
            >
              <Image
                src={member.imageUrl}
                alt={`${member.name}, Chronoverse Capital team member`}
                width={112}
                height={112}
                sizes="112px"
                className="h-28 w-28 rounded-full border border-border object-cover"
              />
              <h3 className="mt-4 text-base font-semibold text-primary">
                {member.name}
              </h3>
              <p className="mt-1 font-mono text-xs font-medium uppercase tracking-wide text-mauve">
                {member.role}
              </p>
              <p className="mt-3 text-sm leading-6 text-secondary">
                {member.description}
              </p>
            </li>
          ))}
        </ul>
      </InstitutionalSection>

      <InstitutionalSection title="Founder and leadership">
        <p>
          <strong className="text-primary">{siteConfig.founder.name}</strong>
          {" — "}Founder
        </p>
        <p>
          <a
            href={siteConfig.founder.linkedInUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Ahmed N. Hassan — LinkedIn
          </a>
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Trust and contact">
        <p>
          Review our <Link href="/methodology">Methodology</Link>,{" "}
          <Link href="/data-sources">Data Sources</Link>,{" "}
          <Link href="/editorial-policy">Editorial Policy</Link>, and{" "}
          <Link href="/disclaimer">Financial Information Disclaimer</Link> for
          the controls behind the public surface.
        </p>
        <p>
          Use <Link href="/contact">Contact</Link> for software, account,
          research, correction, or historical purchase-support inquiries. Our{" "}
          <Link href="/manifesto">operating principles</Link> describe the
          principles applied across the platform. The{" "}
          <Link href="/privacy-policy">Privacy Policy</Link>,{" "}
          <Link href="/cookie-policy">Cookie Policy</Link> and{" "}
          <Link href="/refund-policy">purchase-support information</Link>{" "}
          explain current service boundaries.
        </p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
