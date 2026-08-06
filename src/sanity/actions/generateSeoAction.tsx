"use client";

import { useCallback, useState } from "react";
import type { DocumentActionComponent, DocumentActionDescription } from "sanity";
import { Icon } from "@sanity/icons";

/**
 * Custom Sanity Studio document action: "Generate SEO & Excerpt (AI)".
 *
 * Available on `post` documents. Calls the `/api/webhook/seo-generate`
 * Next.js Route Handler, which uses AI (with a deterministic fallback) to
 * produce a professional meta description and rich excerpt, then patches
 * the document directly in Sanity.
 */
export const generateSeoAction: DocumentActionComponent = (props): DocumentActionDescription | null => {
  const { id, type, draft, published, onComplete } = props;
  const [isRunning, setIsRunning] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetId = draft?._id || published?._id || id;

  const handleGenerate = useCallback(async () => {
    setIsRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/webhook/seo-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: targetId }),
      });

      const data = await response.json();

      if (!response.ok || data.status !== "success") {
        throw new Error(data?.message || "Failed to generate SEO content");
      }

      setDialogOpen(false);
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error generating SEO content");
    } finally {
      setIsRunning(false);
    }
  }, [targetId, onComplete]);

  if (type !== "post") return null;

  return {
    label: isRunning ? "Generating…" : "Generate SEO & Excerpt (AI)",
    icon: () => <Icon symbol="sparkles" />,
    disabled: isRunning,
    onHandle: () => setDialogOpen(true),
    dialog: dialogOpen
      ? {
          type: "confirm",
          message: error
            ? `Error: ${error}`
            : "Generate a professional SEO meta description and rich excerpt for this article using AI? This will overwrite the existing excerpt and SEO description fields.",
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
