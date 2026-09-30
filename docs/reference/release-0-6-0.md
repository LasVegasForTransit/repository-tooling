# Repository tooling 0.6.0

`lvbt deploy` now uses `cf deploy` when an app has a `cloudflare.config.ts`. A `platform.json` can
point `cloudflare.cloudflareConfig` at a sibling deploy package; that canonical project deploys once
even if the app retains a Wrangler config for previews. Repositories without a cf config continue to
deploy with Wrangler. Deploys still build first, require a clean checkout, and record the exact Git
commit in the deployment message.

Production preflight reads the canonical cf config's Worker name and bindings. It accepts an
inventory-scoped `LVBT_CLOUDFLARE_INVENTORY_TOKEN` for Cloudflare API reads; while cf is in beta, it
can also use Wrangler's local sign-in when no API token is available. A cf login by itself cannot
currently authorize that inventory, so the report explains the required credential. Bootstrap uses
cf for D1 and R2 creation and D1 migrations on cf projects. Single-secret writes still use Wrangler
with the value on standard input, because cf beta has no equivalent safe command.

The catalog adds `cf` 1.0.0-beta.5 and updates Wrangler to 4.141.0, the version cf's bundler
requires. Repositories using cf must declare it as a dependency of the deploy package. Cf's
generated `.cloudflare` output is ignored by the shared source checks and ESLint rules.
