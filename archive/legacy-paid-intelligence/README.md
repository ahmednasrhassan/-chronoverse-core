# Legacy paid intelligence archive

Preserved from verified Free-Only production commit `4f9ce110233eea108a1d31b6765949dff5e179af` on 2026-10-23. This is an engineering archive for possible future reuse, not an enabled product or public offering.

25 original Git blobs are preserved: 21 relocated files and four former implementations replaced by permanent 404 shims. No customer records, receipts, credentials or settlement evidence are stored here. No financial engine or shared provider was removed.

## Packaging and boundaries

Each file keeps its original repository-relative path below `charts/`, `market-rooms/`, `deep-engines/` or `tests/`, with an added `.source` suffix. Bytes match the source Git blob (LF), independently of Windows checkout line endings. Local `.gitattributes` disables further text conversion. SHA-256, Git blob IDs, snapshot and last-change commits, and direct import dependencies are recorded per file in [manifest.json](manifest.json); [manifest.md](manifest.md) documents the classification and inventory.

The suffix prevents Next.js routing, TypeScript compilation and test discovery. There are no runtime imports into the archive. `src/app/globals.css` explicitly excludes this directory from Tailwind scanning. Active TypeScript and ESLint configuration remains unchanged. The `echarts` dependency is left in the existing lockfile for preservation; its only application renderer has been archived and it has no active runtime import.

## Restoration

1. Create a separate clean worktree/branch at the source commit above for historical investigation, or at the then-current application commit for a reviewed integration. Never overwrite the active production worktree.
2. Read every `entries` record in `manifest.json`. Verify the archived file's SHA-256 and Git blob ID before copying it to `original` in that isolated worktree, stripping only the added `.source` suffix. Recreate original directories. Do not overwrite concurrent changes without review. At the source commit, files can instead be recovered directly with Git without this archive.
3. Restore the listed shared and package dependencies from the source commit for an exact historical reproduction. For integration into a newer release, adapt them deliberately; canonical contracts, access controls and framework APIs may have changed. The archive is not a standalone runnable package.
4. Run archived tests only after restoring original paths in the isolated worktree. Several tests inspect source files and require those original paths; the normal application suite intentionally does not discover them here. Preserve the active retirement/billing guard tests.
5. Restoring old implementations does not authorize enabling commercial access. The original snapshot was already Free-Only. Keep 404/410 guards, transaction handlers, provider provenance, freshness and entitlement checks until a separate product and security review approves a new launch. No credentials are included or provisioned by this archive.

## Validation

`node --test scripts/tests/legacy-paid-archive.test.mjs` checks archived hashes, compilation exclusion, import isolation and the real Tailwind source scanner. Run it through the existing offline preload and sanitized environment, alongside the retained public retirement, Deep-denial, billing and affected ECB tests. Remote production build and live checks are recorded in the release report; this document does not claim a build result in advance.
