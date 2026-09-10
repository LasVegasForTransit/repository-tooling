# Repository tooling 0.3.0

This release adds the reusable LVBT web platform standard. Astro publications and Vite/React tools
share pinned TypeScript, ESLint, Prettier, Vitest, Playwright, GitHub Actions, and Cloudflare Worker
contracts without coupling their application code.

The `@lvbt/web-platform` package provides deterministic preset vendoring, GitHub and Cloudflare
resource reconciliation, read-only diagnostics, affected-project deployment planning, immutable
Worker previews, preview cleanup, release provenance, and guarded rollback operations. Browser
acceptance includes shared accessibility assertions and project-specific visual baselines separated
by browser project and rendering platform.

The Labs monorepo validated the vendored preset through its complete repository, desktop and mobile
browser, and isolated retirement-archive checks before this stable release.
