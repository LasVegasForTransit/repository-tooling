# Repository tooling 0.7.9

Retained release migrations keep Worker-version checks on the existing Worker publisher credential.
The separate `CLOUDFLARE_MIGRATIONS_API_TOKEN` is used only as the D1 subprocess's API credential,
so a database-only token no longer blocks a production-version check during promotion. The shared
publisher workflow supplies both credentials separately and preserves the check before SQL.

An unset separate migration key keeps the existing legacy fallback. An explicitly empty or blank key
fails before SQL rather than using the publisher's database authority. No token rotation or
additional permissions are required for applications that already have both scoped credentials.

Adopt the matching tooling package and reusable publisher workflow together. All shared package
versions, example dependency pins, and contribution plugin references advance to 0.7.9.

Generated application workflows pin the merged publisher repair. Their source-history check accepts
reviewed revisions on the remote default branch while continuing to reject unmerged or unavailable
commits; it no longer restricts valid pins to the historical 0.7.0 release.
