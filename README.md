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

See [the retirement policy and verification report](docs/free-only-mode.md) and
[the exact change and dependency inventory](docs/retirement-audit.json).

Sanity publishing, newsletter delivery, legal disclosures, and account identity
remain supported. Historical financial processing is retained pending a verified
provider retirement. The apps hostname keeps its existing DNS and Vercel setup;
this cleanup introduces no catalog implementation or payment flow.

The preserved Markdown publishing CLI is `node publish-article.mjs article.md`.
Use `--dry-run` to inspect output before publishing; category resolution can still
read Sanity. Its dependencies are included by `npm ci`.
