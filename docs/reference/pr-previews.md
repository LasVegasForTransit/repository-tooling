# Pull request previews

Applications call the pinned `release-pr-preview.yml` reusable workflow. It owns setup, the
repository's `pnpm check`, preview publication, product smoke and browser acceptance, and one
bot-owned PR comment per release profile. Each profile has a separate marker and visible name;
single-app callers preserve their existing comment marker. Callers declare their existing preview
environment, opt-in condition, publication mode, and product scripts. Missing preview credentials
produce a setup summary and skip publication. Forks and `pull_request_target` events cannot run
deployment or cleanup jobs.

`publication-mode: version` uses a thin application script backed by `runWorkerPreview`. The shared
workflow always supplies `--env preview`, a `pr-N` alias, and a commit message. It never supplies
`--secrets`, activates a version, changes the permanent staging origin, or retains a promotion
artifact. `preview-pages: true` preserves application prototype/debug pages in this PR build.

`publication-mode: named-staging` with `preview-script: api` and `smoke-script: api` uses
`lvbt release pr-preview`. This supports Workers with Durable Objects. The operation validates the
same-repository PR event, number, base branch, current commit and run before any mutation. It
derives the PR Worker name as `<productionWorker>-pr-N` and its origin from the reviewed
`workersDevSubdomain`. A manifest can instead declare `workersDevSubdomainEnv` to read the reviewed
public account label from `LVBT_WORKERS_DEV_SUBDOMAIN`. Missing or invalid values stop release
configuration, and declaring both a literal and a selector is rejected. The workflow resolves this
origin before building and sets `VITE_SITE_URL`.

The named operation packages canonical typed inputs with the shared saved-artifact producer into a
private temporary directory. It retains exact SQL, clears preview routes and crons, selects the
declared isolated preview database and rate limits, and binds Durable Objects to the PR Worker.
Declared shared read-only R2 bindings keep the same reviewed handler contract as ordinary staging.
After resealing and verifying these inputs, it applies only preview migrations, deploys only the PR
Worker, and verifies its release marker and declared API smoke. Temporary files are deleted on
success or failure; the workflow never exports an artifact, candidate proof, or attestation.

`protection: access` requires anonymous denial and uses scoped Access credentials for acceptance.
`protection: public` preserves an application's public PR-preview policy and passes no Access
credentials, including when those variables exist elsewhere. Main staging and production retain
their separately declared protection requirements. Browser traces are not uploaded by this workflow.

Named callers include `closed` in their PR event types. The shared cleanup job cancels in-flight
publication through the same concurrency group, verifies the authenticated Cloudflare account's
Workers subdomain, and deletes only the derived closed-PR Worker. It never deletes the shared
preview database or buckets. A missing Worker is harmless; other failures require reconciliation.
Cleanup checks out tools and configuration from the repository's default branch, including when a PR
closes without merging. The original event SHA is retained solely for run correlation; rejected PR
code does not supply credentialed cleanup tools.

Product browser adapters can call `prPreviewConfiguration(config, process.env.LVBT_PR_NUMBER)` when
validating a named PR origin. The shared workflow sets `LVBT_PR_NUMBER` and `PLAYWRIGHT_BASE_URL`;
adapters retain the application's HTTP, browser, onboarding, and realtime acceptance behavior.

## Isolated typed Worker version previews

For credential isolation, use two caller workflows. The PR caller invokes
`release-pr-preview-build.yml` with its artifact prefix, public build settings and preview-page
opt-in. It has read-only repository/package access, no environment and no inherited secrets. The
trusted main caller listens for that completed build through `workflow_run` and invokes
`release-pr-preview-publish.yml`. It supplies the exact build workflow path, preview environment and
trusted product acceptance scripts.

The publisher checks out main tools only and downloads a uniquely named payload from the validated
successful run. The still-open PR must belong to this repository, target main, and retain the same
head commit. Files and identity are verified, and only the bundled entry point and static assets
become upload inputs. PR configuration and migrations are ignored. External or computed module
imports are rejected; builtins remain available. The upload uses trusted main configuration with
isolated preview bindings and never activates a version or changes permanent routes. Deployment
credentials exist only during upload; Access credentials exist only during trusted acceptance. Forks
are excluded. PR payloads expire after seven days and cannot be selected for promotion.

Set the preview and production environment branch policies to selected branch `main` before enabling
this path. Repository-scoped deployment secrets must be removed after their consumers are migrated.
A repository writer remains an authorized publisher; this boundary keeps PR build code outside the
credentialed runner.

Isolated previews require separate preview resources. They reject `previewReadOnlyBindings`: a
read-only facade generated by an untrusted PR cannot safely limit access to a production bucket. The
publisher copies only the verified static assets into the trusted browser suite's expected `dist`
directory; acceptance code always comes from `main`.
