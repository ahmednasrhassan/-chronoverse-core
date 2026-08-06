"use client";

import { useEffect, useState } from "react";
import { useClient } from "sanity";
import { DashboardWidgetContainer } from "@sanity/dashboard";
import { Stack, Card, Text, Flex, Box } from "@sanity/ui";

interface RecentDoc {
  _id: string;
  title: string;
  _type: string;
  _updatedAt: string;
  publishedAt?: string | null;
}

const RECENT_QUERY = `*[_type in ["post", "page"]] | order(_updatedAt desc)[0...8]{
  _id, title, _type, _updatedAt, publishedAt
}`;

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.round(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

/**
 * Recent Content widget — shows the most recently updated posts and pages
 * across the dataset, regardless of draft/published status.
 */
export function RecentContentWidget() {
  const client = useClient({ apiVersion: "2024-03-01" });
  const [docs, setDocs] = useState<RecentDoc[] | null>(null);

  useEffect(() => {
    let isMounted = true;
    client
      .fetch<RecentDoc[]>(RECENT_QUERY)
      .then((result) => {
        if (isMounted) setDocs(result);
      })
      .catch(() => {
        if (isMounted) setDocs([]);
      });
    return () => {
      isMounted = false;
    };
  }, [client]);

  return (
    <DashboardWidgetContainer header="Recent Content">
      <Box padding={3}>
        <Stack space={2}>
          {docs === null && <Text muted>Loading…</Text>}
          {docs !== null && docs.length === 0 && <Text muted>No content yet.</Text>}
          {docs?.map((doc) => (
            <Card key={doc._id} padding={2} radius={2} tone={doc.publishedAt ? "positive" : "caution"}>
              <Flex justify="space-between" align="center">
                <Text size={1} weight="semibold">
                  {doc.title || "Untitled"}
                </Text>
                <Text size={0} muted>
                  {doc._type} · {formatRelativeTime(doc._updatedAt)}
                </Text>
              </Flex>
            </Card>
          ))}
        </Stack>
      </Box>
    </DashboardWidgetContainer>
  );
}

export default RecentContentWidget;
