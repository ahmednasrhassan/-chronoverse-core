import type { SoftwareApplication } from "@/config/applications";
import { applicationUrl, availableDownload } from "@/config/applications";

export function ApplicationAvailability({
  availability,
}: Pick<SoftwareApplication, "availability">) {
  return (
    <span className="cv-status">
      {availability === "available" ? "Available" : "Coming soon"}
    </span>
  );
}

export function ApplicationCard({
  application,
}: {
  application: SoftwareApplication;
}) {
  return (
    <article className="cv-app-card">
      <div className="cv-release-top">
        <span className="cv-eyebrow">{application.category}</span>
        <ApplicationAvailability availability={application.availability} />
      </div>
      <div className="cv-app-glyph" aria-hidden="true">
        {application.name.slice(0, 1)}
      </div>
      <h3>
        <a href={applicationUrl(application.slug)}>{application.name}</a>
      </h3>
      <p>{application.summary}</p>
      <div className="cv-article-foot">
        <span>
          {application.platforms.join(" / ") || "Platforms to be confirmed"}
        </span>
        <span aria-hidden="true">↗</span>
      </div>
    </article>
  );
}

export function ApplicationFeatures({
  features,
}: Pick<SoftwareApplication, "features">) {
  return (
    <section className="cv-product-section" aria-labelledby="features-title">
      <p className="cv-eyebrow">Capabilities</p>
      <h2 id="features-title">Features</h2>
      {features.length ? (
        <div className="cv-principles">
          {features.map((feature) => (
            <article key={feature.title}>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      ) : (
        <p>Features will be published when confirmed.</p>
      )}
    </section>
  );
}

export function ApplicationRequirements({
  requirements,
}: Pick<SoftwareApplication, "requirements">) {
  return (
    <section
      className="cv-product-section"
      aria-labelledby="requirements-title"
    >
      <p className="cv-eyebrow">Before you download</p>
      <h2 id="requirements-title">System requirements</h2>
      {requirements.length ? (
        <ul className="cv-requirements">
          {requirements.map((requirement) => (
            <li key={requirement}>{requirement}</li>
          ))}
        </ul>
      ) : (
        <p>Requirements have not been confirmed.</p>
      )}
    </section>
  );
}

export function ApplicationDownload({
  application,
}: {
  application: SoftwareApplication;
}) {
  const download = availableDownload(application);
  return (
    <section className="cv-product-section" aria-labelledby="download-title">
      <p className="cv-eyebrow">Release information</p>
      <h2 id="download-title">Download information</h2>
      <dl className="cv-product-facts">
        <div>
          <dt>Availability</dt>
          <dd>
            <ApplicationAvailability availability={application.availability} />
          </dd>
        </div>
        <div>
          <dt>Platforms</dt>
          <dd>{application.platforms.join(", ") || "To be confirmed"}</dd>
        </div>
        {application.version ? (
          <div>
            <dt>Version</dt>
            <dd>{application.version}</dd>
          </div>
        ) : null}
        {download ? (
          <>
            <div>
              <dt>File format</dt>
              <dd>{download.format}</dd>
            </div>
            <div>
              <dt>Download size</dt>
              <dd>{download.size}</dd>
            </div>
          </>
        ) : null}
      </dl>
      {download ? (
        <a
          className="cv-button cv-button-primary"
          href={download.url}
          rel="noopener noreferrer"
        >
          Download {application.name} <span aria-hidden="true">↓</span>
        </a>
      ) : (
        <p>A download is not currently available.</p>
      )}
    </section>
  );
}

export function ApplicationDetails({
  application,
}: {
  application: SoftwareApplication;
}) {
  return (
    <div className="cv-platform cv-container">
      <section className="cv-catalog-hero">
        <a href={applicationUrl()} className="cv-text-link">
          ← All applications
        </a>
        <p className="cv-eyebrow">{application.category}</p>
        <h1>{application.name}</h1>
        <p className="cv-hero-intro">{application.description}</p>
        <ApplicationAvailability availability={application.availability} />
      </section>
      <ApplicationFeatures features={application.features} />
      <ApplicationRequirements requirements={application.requirements} />
      <ApplicationDownload application={application} />
    </div>
  );
}
