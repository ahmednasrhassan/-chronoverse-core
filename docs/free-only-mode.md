# Publication and legacy retirement

Chronoverse Capital publishes independent financial research. The retired five-market
Free Lite and VIP implementations and their source archives have been removed.
See [the cleanup audit](legacy-cleanup-20261023.md) for exact scope and verification.

Account sign-in, Sanity publishing, newsletters, consent and editorial analytics
remain. Historical payment signatures, receipts, refund handling, reconciliation,
configuration and database migrations are retained. Billing shows purchase support.
Checkout and portal APIs return 410 without loading commercial services.

Retired commercial page families return no-store 404s in proxy before sessions or
rewrites. Old public market URLs redirect directly to /reports. Product APIs and
the acquisition cron return 410 without contacting providers or storage.

No production data, tables, environment variables, payment settings, DNS or Vercel
resources are changed. apps.chronoversecapital.com remains independently configured;
this cleanup creates no catalog, app, subscription or checkout flow.
