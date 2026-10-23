import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApplicationDetails } from "@/components/applications/ApplicationPresentation";
import {
  applicationUrl,
  applications,
  findApplication,
} from "@/config/applications";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return applications.map((application) => ({ slug: application.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const application = findApplication(slug);
  if (!application) notFound();
  return {
    title: application.name,
    description: application.summary,
    alternates: { canonical: applicationUrl(slug) },
    openGraph: {
      title: application.name,
      description: application.summary,
      url: applicationUrl(slug),
      type: "website",
    },
  };
}

export default async function ApplicationPage({ params }: Props) {
  const { slug } = await params;
  const application = findApplication(slug);
  if (!application) notFound();
  return <ApplicationDetails application={application} />;
}
