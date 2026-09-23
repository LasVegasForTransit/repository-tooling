# Repository tooling 0.3.4

`pnpm standards:update` now adds Playwright's output folders to the repository's root `.gitignore`,
so running the end-to-end tests no longer leaves an untracked `apps/site/test-results/` behind. The
rules are `test-results/`, `playwright-report/`, `blob-report/`, and `**/playwright/.cache/`.

Playwright writes these folders beside each app's configuration, not at the repository root, so the
rules carry no leading slash. The cache rule starts with `**/` because git anchors any pattern with
a slash in the middle to the directory of the `.gitignore` that holds it.

The updater appends only the rules the file lacks and keeps every existing line. The dry run lists
`.gitignore` under `consumerChanged` before anything is written. The three example repositories, and
the templates published from them, carry the same rules.

A repository updating from v0.3.3 or earlier runs its previously vendored updater, which predates
these rules, so one run of the update installs v0.3.4 without changing `.gitignore`. Run
`pnpm standards:update --release v0.3.4 --apply` a second time. The second run uses the v0.3.4
updater, changes no vendored files, and adds the rules. Release 0.3.5 removes the need for the
second run in later updates.
