"use client";

import { useEffect, useState } from "react";
import { useClient } from "sanity";
import { DashboardWidgetContainer } from "@sanity/dashboard";
import { Grid, Card, Text, Box, Stack } from "@sanity/ui";

interface ImageAsset {
  _id: string;
  url: string;
  originalFilename?: string;
}

const IMAGES_QUERY = `*[_type == "sanity.imageAsset"] | order(_createdAt desc)[0...12]{
  _id, url, originalFilename
}`;

/**
 * Image Assets Manager widget — visual grid preview of the most recently
 * uploaded image assets in the dataset (Sanity Assets library).
 */
export function ImageAssetsWidget() {
  const client = useClient({ apiVersion: "2024-03-01" });
  const [images, setImages] = useState<ImageAsset[] | null>(null);

  useEffect(() => {
    let isMounted = true;
    client
      .fetch<ImageAsset[]>(IMAGES_QUERY)
      .then((result) => {
        if (isMounted) setImages(result);
      })
      .catch(() => {
        if (isMounted) setImages([]);
      });
    return () => {
      isMounted = false;
    };
  }, [client]);

  return (
    <DashboardWidgetContainer header="Image Assets Manager">
      <Box padding={3}>
        {images === null && <Text muted>Loading…</Text>}
        {images !== null && images.length === 0 && <Text muted>No images uploaded yet.</Text>}
        {images && images.length > 0 && (
          <Grid columns={[3, 4]} gap={2}>
            {images.map((image) => (
              <Stack key={image._id} space={1}>
                <Card radius={2} overflow="hidden" style={{ aspectRatio: "1 / 1", position: "relative" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${image.url}?w=120&h=120&fit=crop&auto=format`}
                    alt={image.originalFilename || "Sanity image asset"}
                    loading="lazy"
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                </Card>
              </Stack>
            ))}
          </Grid>
        )}
      </Box>
    </DashboardWidgetContainer>
  );
}

export default ImageAssetsWidget;
