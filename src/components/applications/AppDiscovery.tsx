"use client";

import { useId, useState } from "react";
import {
  filterApplications,
  type SoftwareApplication,
} from "@/config/applications";
import { ApplicationCard } from "./ApplicationPresentation";

export function AppDiscovery({
  applications,
}: {
  applications: readonly SoftwareApplication[];
}) {
  const [query, setQuery] = useState("");
  const searchId = useId();
  const filtered = filterApplications(applications, query);
  return (
    <section
      className="cv-discovery cv-container"
      aria-labelledby="collection-title"
    >
      <div className="cv-catalog-toolbar">
        <div>
          <p className="cv-eyebrow">The collection</p>
          <h2 id="collection-title">Original applications</h2>
        </div>
        <div className="cv-search">
          <label htmlFor={searchId}>Search the catalog</label>
          <div>
            <span aria-hidden="true">⌕</span>
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search applications…"
              autoComplete="off"
            />
          </div>
        </div>
      </div>
      {filtered.length ? (
        <div className="cv-app-grid">
          {filtered.map((application) => (
            <ApplicationCard key={application.slug} application={application} />
          ))}
        </div>
      ) : (
        <div className="cv-catalog-empty" role="status">
          <div className="cv-outline-symbol" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className="cv-eyebrow">
            {applications.length
              ? "No matching applications"
              : "Pre-launch / No releases yet"}
          </p>
          <h3>
            {applications.length
              ? "A different search, perhaps."
              : "Good things take intention."}
          </h3>
          <p>
            {applications.length
              ? "Try another name, platform or keyword."
              : "No applications have been released yet. This is the future home of original Chronoverse software. Product details and downloads will appear here when a release is ready."}
          </p>
          {query ? (
            <button className="cv-text-link" onClick={() => setQuery("")}>
              Clear search <span aria-hidden="true">↗</span>
            </button>
          ) : (
            <a
              href="https://chronoversecapital.com/reports"
              className="cv-text-link"
            >
              Explore our research <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      )}
    </section>
  );
}
