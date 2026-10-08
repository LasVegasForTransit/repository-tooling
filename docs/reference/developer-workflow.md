# Developer workflow

LVBT maintains one implementation of setup, validation, audits, contribution automation, and web
releases in repository-tooling. Repositories configure the shared tools and supply product checks;
they do not maintain alternative engines. Vendored snapshots are generated release artifacts.

## Local development

Run `pnpm bootstrap`, then `pnpm dev`. Local bootstrap checks the Node and pnpm versions before
installing, wires hooks, and creates missing environment files declared in `.lvbt/tooling.json`. It
preserves existing values. `pnpm preflight` reports readiness without changing files. Neither
command requires GitHub or Cloudflare authentication. Optional integration configuration is reported
as a warning; it does not prevent page development. Production checks use `--production` explicitly.

## Validation and contribution

Run `pnpm check` before sharing changes. It includes standard integrity and repository contract
checks through `lvbt check`. Product-specific checks belong in the Turbo `validate` task. Work on a
branch, commit explicit paths, and open a pull request using the organization contribution helper.
Merge through the required Validate status and linear history. A new contract requirement warns in
0.7.x before enforcement in 0.8.0; migrations in this rollout resolve every warning.

## Audits

Run `pnpm run audit` for local audits, or select `links`, `lighthouse`, or `dependencies`.
Production measurements require `--target production`. Each audit reports pass, failure, or
execution error with its reproduction command and concrete findings. Configuration is version 1 in
`.lvbt/tooling.json`. Never route a local compiled-Worker check to public production as a fallback.

Trusted default-branch scheduled audits and their manual reruns maintain one bug per check and
target. Owned issues use visible audit-owned, audit:<check>, and target:<target> labels. Repeated
failures update the issue; verified recovery closes it; a regression reopens it. Execution errors,
skipped checks, missing artifacts, and stale runs cannot establish recovery. The contribution helper
previews every reconciliation action and verifies what GitHub stored.

## Web publication

Main builds update staging. `pnpm promote` selects and publishes the saved, reviewed artifact
without rebuilding. Shared release tools verify identity, hashes, preview protection, and product
browser acceptance, and retain publication receipts. Publishing commands check their credentials
when used. An uncertain publication must be reconciled before another dispatch. Production promotion
is an explicit operation. Recovery deploy commands do not replace that release process.

## Ownership and extensions

`.lvbt/tooling.json` declares local environments, audit targets and tools, and release selection.
`platform.json` declares production resource and secret requirements. Secret values never belong in
these tracked files. Product behavior and budgets remain in application code and configuration.
Common tool adapters, diagnostics, state machines, and workflow execution belong in the shared
packages. Change the standard upstream; never edit its vendored tree by hand.
