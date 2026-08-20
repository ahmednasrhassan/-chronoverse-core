"use client";

import { useEffect, useState } from "react";
import { useClient } from "sanity";
import { DashboardWidgetContainer } from "@sanity/dashboard";
import { Stack, Grid, Card, Text, Flex } from "@sanity/ui";

interface StatsResult {
  posts: number;
  drafts: number;
  pages: number;
  authors: number;
  categories: number;
  images: number;
}

const STATS_QUERY = `{
  "posts": count(*[_type == "post"]),
  "drafts": count(*[_type == "post" && !defined(publishedAt)]),
  "pages": count(*[_type == "page"]),
  "authors": count(*[_type == "author"]),
  "categories": count(*[_type == "category"]),
  "images": count(*[_type == "sanity.imageAsset"])
}`;

function StatCard({ label, value }: { label: string; value: number | null }) {
  return (
    <Card padding={3} radius={2} shadow={1} tone="primary">
      <Stack space={2}>
        <Text size={3} weight="bold">
          {value === null ? "…" : value}
        </Text>
        <Text size={1} muted>
          {label}
        </Text>
      </Stack>
    </Card>
  );
}

/**
 * Content Stats widget — shows at-a-glance counts of published posts,
 * drafts, pages, authors, categories, and image assets across the dataset.
 */
export function ContentStatsWidget() {
  const client = useClient({ apiVersion: "2024-03-01" });
  const [stats, setStats] = useState<StatsResult | null>(null);

  useEffect(() => {
    let isMounted = true;
    client
      .fetch<StatsResult>(STATS_QUERY)
      .then((result) => {
        if (isMounted) setStats(result);
      })
      .catch(() => {
        if (isMounted) setStats(null);
      });
    return () => {
      isMounted = false;
    };
  }, [client]);

  return (
    <DashboardWidgetContainer header="Content Stats">
      <Flex padding={3}>
        <Grid columns={[2, 3]} gap={3} style={{ width: "100%" }}>
          <StatCard label="Published Posts" value={stats ? stats.posts - stats.drafts : null} />
          <StatCard label="Drafts" value={stats ? stats.drafts : null} />
          <StatCard label="Pages" value={stats ? stats.pages : null} />
          <StatCard label="Authors" value={stats ? stats.authors : null} />
          <StatCard label="Categories" value={stats ? stats.categories : null} />
          <StatCard label="Image Assets" value={stats ? stats.images : null} />
        </Grid>
      </Flex>
    </DashboardWidgetContainer>
  );
}

export default ContentStatsWidget;
