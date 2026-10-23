import Link from "next/link";
import type { ReactNode } from "react";
import { APPLICATIONS_ORIGIN } from "@/config/applications";
import { NEWSLETTER_SIGNUPS_PAUSED } from "@/config/newsletterAvailability";
import { ArchitecturalMark } from "./ArchitecturalMark";

export function PlatformHomePageContent({
  researchPreview,
}: {
  researchPreview: ReactNode;
}) {
  return (
    <div className="cv-platform">
      <section
        className="cv-hero cv-container"
        aria-labelledby="platform-title"
      >
        <div className="cv-hero-copy">
          <p className="cv-eyebrow">
            <span className="cv-line" /> Independent software &amp; ideas
          </p>
          <h1 id="platform-title">
            Original software.
            <br />
            <span>
              Independent
              <br className="cv-desktop-break" /> by design.
            </span>
          </h1>
          <p className="cv-hero-intro">
            Chronoverse Capital is an independent, English-language platform for
            original downloadable software and focused work. Research on
            economics, finance and history supports a broader perspective.
          </p>
          <div className="cv-actions">
            <a
              className="cv-button cv-button-primary"
              href={APPLICATIONS_ORIGIN}
            >
              Explore applications <span aria-hidden="true">↗</span>
            </a>
            <Link className="cv-text-link" href="/reports">
              Read the research <span aria-hidden="true">→</span>
            </Link>
          </div>
          <p className="cv-hero-note">
            ORIGINAL APPLICATIONS <span aria-hidden="true">/</span> OPEN IDEAS
          </p>
        </div>
        <ArchitecturalMark />
      </section>

      <section className="cv-software-section" aria-labelledby="software-title">
        <div className="cv-container cv-software-grid">
          <div>
            <p className="cv-eyebrow">01 / The software collection</p>
            <h2 id="software-title">
              Purpose before
              <br />
              <span>possibility.</span>
            </h2>
            <p className="cv-section-copy">
              A considered collection of original applications. Each release
              will have its own space to explain what it does, who it is for and
              what you need to run it. Product categories and supported systems
              have not yet been confirmed.
            </p>
            <a href={APPLICATIONS_ORIGIN} className="cv-text-link">
              Visit the apps catalog <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div className="cv-release-state">
            <div className="cv-release-top">
              <span className="cv-eyebrow">Chronoverse originals</span>
              <span className="cv-status">Pre-launch</span>
            </div>
            <div className="cv-outline-symbol" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <h3>The first chapter is ahead.</h3>
            <p>
              No applications have been released yet. Our first original
              software release will appear in the catalog when it is ready.
            </p>
            <a href={APPLICATIONS_ORIGIN} className="cv-text-link">
              Explore the collection <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </section>

      <section
        className="cv-approach cv-container"
        aria-labelledby="approach-title"
      >
        <div className="cv-section-heading">
          <p className="cv-eyebrow">02 / Our point of view</p>
          <h2 id="approach-title">
            Good tools begin
            <br />
            with better questions.
          </h2>
        </div>
        <div className="cv-principles">
          {[
            [
              "01",
              "Original by intention",
              "A platform for software created by Chronoverse, with a clear purpose and a distinct point of view.",
            ],
            [
              "02",
              "Focused by design",
              "We value considered functionality, readable interfaces and the details that make a tool useful.",
            ],
            [
              "03",
              "Clear before you commit",
              "Product pages will explain features, requirements and availability so you can make an informed choice.",
            ],
          ].map(([number, title, description]) => (
            <article key={number}>
              <span className="cv-index">{number}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      {researchPreview}

      <section
        className="cv-contact-band cv-container"
        aria-labelledby="conversation-title"
      >
        <div>
          <p className="cv-eyebrow">Independent, and open to conversation</p>
          <h2 id="conversation-title">
            A question. An idea.
            <br />
            <span>A place to start.</span>
          </h2>
        </div>
        <div>
          <p>
            For questions about Chronoverse, our research or future software,
            get in touch.{" "}
            {NEWSLETTER_SIGNUPS_PAUSED
              ? "Newsletter signups and delivery are temporarily paused. Published research remains available on the website."
              : "Follow published research through our existing newsletter."}
          </p>
          <div className="cv-actions">
            <Link href="/contact" className="cv-button cv-button-primary">
              Get in touch <span aria-hidden="true">↗</span>
            </Link>
            <Link href="/newsletter" className="cv-text-link">
              {NEWSLETTER_SIGNUPS_PAUSED ? "Newsletter status" : "The newsletter"}{" "}
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
