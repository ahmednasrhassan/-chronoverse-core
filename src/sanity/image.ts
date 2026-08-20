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

/**
 * Performance-optimized image URL builder.
 *
 * Wraps `urlFor` with two Lighthouse/Core-Web-Vitals-critical defaults:
 *  - `.auto("format")` — instructs the Sanity Image CDN to automatically
 *    negotiate and serve modern, heavily-compressed formats (AVIF/WebP)
 *    based on the requesting browser's `Accept` header, instead of shipping
 *    the original (often much larger) JPEG/PNG.
 *  - `.quality(80)` — a well-tested sweet spot that keeps visual fidelity
 *    high while meaningfully cutting payload size versus the default 100.
 *
 * Callers can continue chaining `.width()`, `.height()`, `.fit()`, etc. on
 * the returned builder — these two defaults are simply applied first so
 * every image on the site benefits automatically, even if a call site
 * forgets to set them explicitly.
 */
export function urlForOptimized(source: SanityImageSource) {
  return builder.image(source).auto("format").quality(80);
}
