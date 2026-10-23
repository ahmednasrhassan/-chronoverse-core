import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApplicationDetails } from "@/components/applications/ApplicationPresentation";
import { buildPublicPageMetadata } from "@/lib/seo/metadata";
import { applications, findApplication } from "@/config/applications";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return applications.map((application) => ({ slug: application.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const application = findApplication(slug);
  if (!application) notFound();
  return buildPublicPageMetadata({
    title: application.name,
    description: application.summary,
    pathname: `/${slug}`,
    site: "apps",
  });
}

export default async function ApplicationPage({ params }: Props) {
  const { slug } = await params;
  const application = findApplication(slug);
  if (!application) notFound();
  return <ApplicationDetails application={application} />;
}
