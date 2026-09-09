# Repository tooling 0.3.0-rc.1

This release candidate adds `@lvbt/web-platform`, the shared infrastructure layer for LVBT web
repositories. It provides structured GitHub and Cloudflare reads, doctor checks, idempotent resource
reconciliation, release provenance, isolated preview configuration, and guarded Worker preview
uploads.

Repository-specific packages retain application discovery, resource naming, route policy, and
lifecycle decisions. The release candidate exists for consumer validation and does not represent the
stable 0.3.0 release.
