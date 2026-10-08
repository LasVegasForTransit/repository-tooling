# Set up a web release

The generated web templates build and sign a saved release on `main`, verify it on protected
staging, and require explicit promotion for production. Local bootstrap, preflight, development and
checks need no publishing credentials. Complete these application declarations before publishing.

1. Choose the production Worker name in the canonical `cloudflare.config.ts`. Match it in
   `.lvbt/tooling.json` and choose a separate preview Worker name there.
2. Record the actual account, zone, Worker and resource requirements in the app's `platform.json`,
   using the [platform manifest reference](../reference/platform-manifest.md). Add new production
   requirements there when the app grows. The static templates require no database or bucket.
3. Configure repository variables `CLOUDFLARE_ACCOUNT_ID`, `LVBT_PRODUCTION_URL`,
   `LVBT_PREVIEW_URL`, and `LVBT_WORKERS_DEV_SUBDOMAIN` for the reviewed account, and matching local
   environment values when running release readiness. Build and signing jobs can read these public
   identifiers without deployment credentials. Use two separate permanent HTTPS origins. The
   subdomain is the actual account suffix for Workers preview URLs, not a Worker name.
4. Configure the `worker-preview` and `worker-candidate` GitHub environments with distinct scoped
   publisher credentials. Protect the preview origin with Access and configure preview service
   credentials through the [production setup guide](set-up-production.md). Keep credentials scoped
   to their environment; maintainers perform this setup.
5. Run `pnpm preflight --production` to report readiness without changing resources. A maintainer
   runs `pnpm bootstrap --production` for explicit provisioning and secret setup.
6. Verify the first signed staging artifact and repository-owned browser acceptance in CI.
   `pnpm promote` selects that saved release for production without rebuilding. When production has
   no shared release marker yet, pass `--expected-version <current-version>` with its verified
   current provider version. Publication stops if that version changed.

The shared [retained-release contract](../reference/retained-releases.md) defines artifact identity,
protection, acceptance and publication receipts. Repository onboarding links to this guide and adds
only its application-specific configuration and acceptance instructions.
