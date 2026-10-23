export const APPLICATIONS_ORIGIN = "https://apps.chronoversecapital.com";

export interface SoftwareApplication {
  readonly slug: string;
  readonly name: string;
  readonly summary: string;
  readonly description: string;
  readonly category: string;
  readonly platforms: readonly string[];
  readonly availability: "available" | "coming-soon";
  readonly features: readonly {
    readonly title: string;
    readonly description: string;
  }[];
  readonly requirements: readonly string[];
  readonly version?: string;
  readonly download?: {
    readonly url: string;
    readonly format: string;
    readonly size: string;
  };
}

// Only reviewed, original applications belong here. No demo products are published.
export const applications: readonly SoftwareApplication[] = Object.freeze([]);

export function applicationUrl(slug = ""): string {
  if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new TypeError("Application slug must be a single safe path segment.");
  }
  return `${APPLICATIONS_ORIGIN}/${slug}`;
}

export function findApplication(slug: string): SoftwareApplication | undefined {
  return applications.find((application) => application.slug === slug);
}

export function filterApplications(
  items: readonly SoftwareApplication[],
  query: string,
) {
  const search = query.trim().toLowerCase();
  return items.filter((app) =>
    [app.name, app.summary, app.category, ...app.platforms]
      .join(" ")
      .toLowerCase()
      .includes(search),
  );
}

export function availableDownload(
  app: SoftwareApplication,
): SoftwareApplication["download"] | undefined {
  if (app.availability !== "available" || !app.download) return undefined;
  try {
    const url = new URL(app.download.url);
    return url.protocol === "https:" && !url.username && !url.password
      ? app.download
      : undefined;
  } catch {
    return undefined;
  }
}
