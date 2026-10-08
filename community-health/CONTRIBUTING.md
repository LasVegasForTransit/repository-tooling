# Contributing to LVBT

Start with the repository's application guide. Run `pnpm bootstrap` to prepare local development,
`pnpm dev` to preview, and `pnpm check` before sharing a change. Local setup does not require cloud
credentials. Optional integrations are configured only when needed.

Work on a branch and use a pull request. Follow the repository's declared commit scopes and required
Validate status. Humans use the native issue forms and pull request template; coding agents use the
pinned lvbt-contributions helper, preview the complete contribution, and verify the stored URL.

Trusted default-branch audit automation uses the same helper to maintain one issue per check and
target with visible ownership labels. Errors, skipped checks, missing reports, and stale runs never
close a finding. The helper previews and verifies every issue reconciliation operation.

For deployable applications, main updates staging. Production publication is an explicit promotion
of a saved artifact. Use the shared release command and retain its publication evidence.

Shared tools and process changes belong in
[repository-tooling](https://github.com/LasVegasForTransit/repository-tooling). Repositories provide
application configuration, budgets, and product acceptance through its documented extension points.
