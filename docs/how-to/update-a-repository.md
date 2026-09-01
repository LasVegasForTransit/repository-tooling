# Bring a repository up to a newer standard

This guide moves a repository that already follows the standard to a newer release. Most of the
standard travels through the `@lvbt/*` packages, so a release usually reaches a repository as a
dependency bump. Use this guide when Renovate opens that bump, or when you want to see how far a
repository has drifted from what the generator writes today.

## Before you start

- The repository has `.lvbt/commit-scopes.txt` and depends on the `@lvbt/*` packages. If not, follow
  [Generate a repository](generate-a-repository.md) first.
- The working tree is clean, so the update is the only thing in the diff you review.

## 1. Bump the packages

Renovate opens one grouped pull request titled "LVBT repository standard" when a new tag exists. To
do it by hand, change the tag in every `@lvbt/*` entry of `package.json`:

```json
"@lvbt/tsconfig": "github:LasVegasForTransit/repository-tooling#v0.2.1&path:/packages/tsconfig"
```

Then:

```bash
pnpm install
pnpm check
```

If `check` fails after the bump, the release notes say what changed and why.

## 2. See what the generator would write differently

```bash
pnpm exec lvbt-repository-tooling diff
```

The report lists standard files that are missing or differ from what `init` writes today, and
whether the Claude marketplace reference in `.claude/settings.json` still points at the installed
version. Drift is allowed; the report exists so you can decide. To take the standard's version of a
file:

```bash
pnpm exec lvbt-repository-tooling apply eslint.config.mjs .githooks/pre-push
```

Files the repository owns (`AGENTS.md`, `ci.yml`, `pnpm-workspace.yaml`, `.gitignore`, the scope
list, and the sample source) are never reported or overwritten.

## 3. Commit

```bash
git add -A
git commit -m "chore(dx): update the LVBT repository standard to v0.2.1"
```

## Migrating from the vendored plugin (repositories adopted before v0.2.0)

Older repositories carry a copy of the plugin under `plugins/lvbt-contributions/`, a pin in
`.lvbt/repository-tooling.json`, and their own `scripts/check-repository-tooling.ts`. Run `init`
with the repository's profile and scopes; it skips every file that already exists and merges
`package.json`. Then delete the vendored plugin, the pin, and the check script, take the generated
hooks with `apply .githooks/commit-msg .githooks/prepare-commit-msg`, and point `.codex/hooks.json`
and `.agents/plugins/marketplace.json` at `node_modules` with `apply` as well.
