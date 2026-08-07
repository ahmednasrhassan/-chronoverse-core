import { createImageUrlBuilder, type SanityImageSource } from "@sanity/image-url";
import { client } from "./client";

const builder = createImageUrlBuilder(client);

/**
 * Resolves a hotspot/crop-aware, optimized image URL builder for any Sanity
 * image reference (e.g. `mainImage`, or images embedded inside Portable
 * Text `body` blocks). Falls back gracefully — callers should still guard
 * against `null`/`undefined` sources.
 */
export function urlFor(source: SanityImageSource) {
  return builder.image(source);
}
