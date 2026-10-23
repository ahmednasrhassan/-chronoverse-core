# Chronoverse Capital

Independent financial research publication built with Next.js and Sanity.

## Local development

Install the locked dependencies with `npm ci`, then run `npm run dev`.
Read `AGENTS.md` and the installed Next.js guides before changing framework code.
Use the existing deployment configuration for service credentials; never commit secrets.

## Verification

- `npm test` runs all retained unit and integration contracts with outbound networking blocked and inherited service credentials removed.
- `npm run typecheck` regenerates route types, then checks TypeScript.
- `npm run lint` checks the whole repository.
- `npm run build` creates a production build.

Local test evidence is written to ignored `.verification/readiness/` independently
of Next build output. Live provider writes and production transactions are not
part of the test suite.

## Legacy product retirement

See [the cleanup audit](docs/legacy-cleanup-20261023.md), the
[exact removed-file inventory](docs/legacy-cleanup-removed-files.txt), and the
[retained dependency inventory](docs/legacy-cleanup-retained-dependencies.json).

Historical billing, legal obligations, CMS publishing, newsletter delivery,
and account identity remain supported. The independent apps hostname is outside
this publication's application architecture; this repository introduces no apps
catalog or new payment flow.
