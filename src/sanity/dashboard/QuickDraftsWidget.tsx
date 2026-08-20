"use client";

import { useEffect, useState } from "react";
import { useClient } from "sanity";
import { DashboardWidgetContainer } from "@sanity/dashboard";
import { Stack, Card, Text, Flex, Box, Badge } from "@sanity/ui";

interface DraftDoc {
  _id: string;
  title: string;
  _updatedAt: string;
}

const DRAFTS_QUERY = `*[_type == "post" && !defined(publishedAt)] | order(_updatedAt desc)[0...8]{
  _id, title, _updatedAt
}`;

/**
 * Quick Drafts widget — surfaces unpublished posts (no `publishedAt` set
 * yet) so editors can quickly jump back into work-in-progress articles.
 */
export function QuickDraftsWidget() {
  const client = useClient({ apiVersion: "2024-03-01" });
  const [drafts, setDrafts] = useState<DraftDoc[] | null>(null);

  useEffect(() => {
    let isMounted = true;
    client
      .fetch<DraftDoc[]>(DRAFTS_QUERY)
      .then((result) => {
        if (isMounted) setDrafts(result);
      })
      .catch(() => {
        if (isMounted) setDrafts([]);
      });
    return () => {
      isMounted = false;
    };
  }, [client]);

  return (
    <DashboardWidgetContainer header="Quick Drafts">
      <Box padding={3}>
        <Stack space={2}>
          {drafts === null && <Text muted>Loading…</Text>}
          {drafts !== null && drafts.length === 0 && <Text muted>No pending drafts. 🎉</Text>}
          {drafts?.map((draft) => (
            <Card key={draft._id} padding={2} radius={2} tone="transparent" border>
              <Flex justify="space-between" align="center">
                <Text size={1}>{draft.title || "Untitled draft"}</Text>
                <Badge tone="caution" fontSize={0}>
                  Draft
                </Badge>
              </Flex>
            </Card>
          ))}
        </Stack>
      </Box>
    </DashboardWidgetContainer>
  );
}

export default QuickDraftsWidget;
