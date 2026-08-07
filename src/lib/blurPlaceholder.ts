/**
 * Shared tiny base64 "shimmer" placeholder used as `blurDataURL` for every
 * `next/image` instance that loads a *remote* image (Sanity CDN, legacy
 * Blogger-hosted assets, etc.) where Next.js cannot statically analyze the
 * file at build time to auto-generate a blur placeholder the way it does
 * for local/static imports.
 *
 * CLS rationale: pairing `placeholder="blur"` with an explicit
 * `width`/`height` (or a `fill` parent that already has a locked
 * aspect-ratio/height) means the browser paints this low-fidelity
 * placeholder into the *exact* final image box immediately, instead of
 * showing nothing/a blank box until the network image arrives. Because
 * the box's dimensions never change between placeholder and final image,
 * this contributes zero additional layout shift — it only improves
 * perceived loading polish on top of the already-reserved dimensions.
 */
export const SHIMMER_BLUR_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNCIgaGVpZ2h0PSI0IiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0IDQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiMxODE4MWIiLz48L3N2Zz4=";
