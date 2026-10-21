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

Release builders skip Git LFS files by default because each download uses the repository owner's
bandwidth allowance. If the application needs those files to build, set `checkout-lfs: true` in its
build-workflow inputs after pinning a merged revision that supports the input. Record the required
paths in the application's build instructions. Fetch screenshot baselines separately in the
visual-test job; the release build does not need them.

The shared [retained-release contract](../reference/retained-releases.md) defines artifact identity,
protection, acceptance and publication receipts. Repository onboarding links to this guide and adds
only its application-specific configuration and acceptance instructions.

## Keep Worker and migration credentials separate

For an application with retained D1 migrations, each release environment needs its existing Worker
publisher credential and the migration credential authorized for that environment's database. Use
the preview credentials in `worker-preview` and production credentials in `worker-candidate`.

1. Store the Worker credential as `CLOUDFLARE_WORKERS_API_TOKEN` and the D1 credential as
   `CLOUDFLARE_MIGRATIONS_API_TOKEN` in the appropriate GitHub environment. Keep the existing
   resource restrictions. The workflow supplies the Worker credential as `CLOUDFLARE_API_TOKEN`; do
   not replace it with the D1 credential around the entire migration command.
2. Adopt the matching shared tooling release and `release-publish.yml` revision together. The
   workflow supplies the migration credential separately. The CLI uses it as `CLOUDFLARE_API_TOKEN`
   only in the D1 subprocess. Worker-version checks continue using the publisher credential.
3. During an authorized publication, verify that the production baseline and retained schema steps
   succeed, then inspect the retained publication receipt and public release identity. An explicit
   expected version must still stop publication if the serving Worker changed before SQL or
   activation. A successful schema step alone does not confirm publication.

For direct CLI use, an unset `CLOUDFLARE_MIGRATIONS_API_TOKEN` preserves the legacy credential
fallback. Use that only when the existing default credential already has the required database
authority. An explicitly empty or blank migration key fails before SQL instead of falling back.
Applications without retained SQL do not need a migration credential.

If a Worker deployment lookup fails inside the migration step, inspect the workflow's credential
mapping before changing permissions: the D1 credential should never replace the publisher for that
lookup. A failure in this pre-write check applies no SQL. A later D1 failure may follow successful
earlier migrations; reconcile the selected database's applied migrations before retrying. Inspect
the publication receipt and current Worker identity before recovering an uncertain activation.
