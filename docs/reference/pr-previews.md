# Pull request previews

Applications call the pinned `release-pr-preview.yml` reusable workflow. It owns setup, the
repository's `pnpm check`, preview publication, product smoke and browser acceptance, and one
bot-owned PR comment. Callers declare their existing preview environment, opt-in condition,
publication mode, and product scripts. Missing preview credentials produce a setup summary and skip
publication. Forks and `pull_request_target` events cannot run deployment or cleanup jobs.

`publication-mode: version` uses a thin application script backed by `runWorkerPreview`. The shared
workflow always supplies `--env preview`, a `pr-N` alias, and a commit message. It never supplies
`--secrets`, activates a version, changes the permanent staging origin, or retains a promotion
artifact. `preview-pages: true` preserves application prototype/debug pages in this PR build.

`publication-mode: named-staging` with `preview-script: api` and `smoke-script: api` uses
`lvbt release pr-preview`. This supports Workers with Durable Objects. The operation validates the
same-repository PR event, number, base branch, current commit and run before any mutation. It
derives the PR Worker name as `<productionWorker>-pr-N` and its origin from the reviewed
`workersDevSubdomain`. The workflow resolves this origin before building and sets `VITE_SITE_URL`.

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

Product browser adapters can call `prPreviewConfiguration(config, process.env.LVBT_PR_NUMBER)` when
validating a named PR origin. The shared workflow sets `LVBT_PR_NUMBER` and `PLAYWRIGHT_BASE_URL`;
adapters retain the application's HTTP, browser, onboarding, and realtime acceptance behavior.
