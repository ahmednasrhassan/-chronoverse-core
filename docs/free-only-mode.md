# Platform availability and retired commercial routes

Chronoverse Capital now presents original software applications alongside its
existing independent research publication. The applications catalog is free to
browse; no software application, checkout, licensing or subscription is launched.
See [the software platform release](software-platform-release.md) for the current
implementation, removal inventory and verification evidence.

The owner confirmed that the legacy payment account is closed, all historical
activity was completed one-time book purchases, and there are no recurring
subscriptions or renewals. Any provider settlement is handled outside the
application. The previous runtime-retention hold is lifted.

The obsolete billing runtime, commercial configuration, webhook processors and
associated tests are removed. The old webhook path and retired billing/market
APIs return a provider-free 410 response before authentication or body parsing.
Historical billing-page URLs still redirect to contact. Former membership pages
remain unavailable; they are not software products.

Historical Supabase migrations and financial records are preserved. No production
data, secrets, DNS, Vercel configuration or database schema is changed. Existing
identity authentication, Sanity publication, newsletter and editorial URLs remain.
Authentication's legacy database fields remain compatible with the historical
schema; they do not call the removed commercial resolver or payment provider.

The earlier [security release](security-release-2026-10-23.md) remains a historical
record. Its dependency patches are preserved. The recorded Moderate CLI advisory
requires the same verification exception described in that release.
