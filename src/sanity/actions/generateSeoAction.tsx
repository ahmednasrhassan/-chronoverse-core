"use client";

import { useCallback, useState } from "react";
import {
  useClient,
  type DocumentActionComponent,
  type DocumentActionDescription,
} from "sanity";
import { Icon } from "@sanity/icons";
import {
  generateFallbackSeo,
  htmlToText,
  portableTextToPlainText,
} from "@/lib/sanity/textUtils";

/**
 * Generates source-based SEO fields inside the authenticated Studio. The
 * editor's Sanity session performs the only two permitted field updates, so
 * no public endpoint or server write token participates in this workflow.
 */
/* eslint-disable react-hooks/rules-of-hooks */
export const generateSeoAction: DocumentActionComponent = (
  props,
): DocumentActionDescription | null => {
  const { id, type, draft, published, onComplete } = props;
  const [isRunning, setIsRunning] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const client = useClient({ apiVersion: "2024-03-01" });

  const targetId = draft?._id || published?._id || id;
  const sourceDocument = draft || published;

  const handleGenerate = useCallback(async () => {
    setIsRunning(true);
    setError(null);

    try {
      const title =
        typeof sourceDocument?.title === "string"
          ? sourceDocument.title.trim()
          : "";
      const structuredText = portableTextToPlainText(sourceDocument?.body);
      const legacyText = htmlToText(
        typeof sourceDocument?.bodyRaw === "string"
          ? sourceDocument.bodyRaw
          : "",
      );
      const sourceText = structuredText || legacyText;

      if (!title || !sourceText) {
        throw new Error(
          "Add a factual title and article body before generating SEO fields.",
        );
      }

      const seo = generateFallbackSeo(sourceText);
      await client
        .patch(targetId)
        .set({ excerpt: seo.excerpt, seoDescription: seo.seoDescription })
        .commit();

      setDialogOpen(false);
      onComplete();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unknown error generating SEO content",
      );
    } finally {
      setIsRunning(false);
    }
  }, [client, onComplete, sourceDocument, targetId]);

  if (type !== "post") return null;

  return {
    label: isRunning ? "Generating…" : "Generate SEO & Excerpt",
    icon: () => <Icon symbol="sparkles" />,
    disabled: isRunning,
    onHandle: () => setDialogOpen(true),
    dialog: dialogOpen
      ? {
          type: "confirm",
          message: error
            ? `Error: ${error}`
            : "Generate a source-based SEO description and excerpt? This overwrites the existing excerpt and SEO description fields.",
          onConfirm: handleGenerate,
          onCancel: () => {
            setDialogOpen(false);
            setError(null);
          },
          confirmButtonText: isRunning ? "Generating…" : "Generate",
        }
      : null,
  };
};

export default generateSeoAction;
