# Repository tooling 0.5.0

A repository now keeps itself on the standard. Updating to 0.5.0 adds a daily `Standard update`
workflow. When a newer release exists, it applies that release with the release's own updater and
opens a pull request. A patch release's pull request merges itself once `Validate` passes; a minor
release's waits for a maintainer, because a minor release can change how the repository works. The
workflow uses only its own token, so there is nothing to set up. It dispatches `ci.yml` to run
`Validate` on the pull request it opened, so `ci.yml` needs a `workflow_dispatch` trigger, as the
examples' has.

The update also points `.claude/settings.json` at the installed release, so the contribution plugin
matches the vendored standard.

Nothing else changes how your repository works yet. Three new rules only warn, and v0.6.0 will
enforce them. Fix what they report before then:

- `pnpm standards:check` warns about files the standard owns that your repository changed:
  `.githooks/*`, `.codex/hooks.json`, `.agents/plugins/marketplace.json`,
  `.github/actions/setup-node-pnpm/action.yml`, and `.editorconfig`, and about a `.prettierrc` file
  that replaces `prettier.config.js`. From v0.6.0 the check fails and the update restores the
  standard's copies. Make changes to those files in repository-tooling instead.
- `lvbt check contract` warns about a shared catalog entry in `pnpm-workspace.yaml` pinned to a
  different version than the standard's catalog. From v0.6.0 the update moves those entries and the
  check fails on any that differ. Entries only your repository uses stay yours.
- The commit hook warns about `ci` as a commit type or scope. It behaved exactly like `chore` in
  every changelog and release tool; use `chore`. From v0.6.0 the hook rejects `ci`, and the update
  removes it from `.lvbt/commit-scopes.txt`.
