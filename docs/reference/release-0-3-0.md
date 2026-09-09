# Repository tooling 0.3.0

Repository tooling 0.3.0 adds the vendorable `@lvbt/web-platform` package. It centralizes GitHub and
Cloudflare provider reads, infrastructure reconciliation, Worker custom domains, Web Analytics
sites, environment credentials, Worker release verification, artifact sealing, deployment checkout
guards, and isolated pull request preview operations.

Generated repositories carry audited pnpm overrides for `sharp` and `smol-toml`. The pre-push hook
clears repository-local Git variables before validation so nested temporary repository tests remain
isolated from the source checkout.

Labs validated the package through its complete repository checks, production builds, and desktop
and mobile browser suites before promotion from the release candidate.
