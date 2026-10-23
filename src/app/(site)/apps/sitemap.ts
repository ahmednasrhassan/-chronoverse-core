import type { MetadataRoute } from "next";
import { applications, applicationUrl } from "@/config/applications";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: applicationUrl(), changeFrequency: "weekly", priority: 1 },
    ...applications.map((application) => ({
      url: applicationUrl(application.slug),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
