# Update a repository to a newer tooling release

This guide moves a repository that already consumes the organization tooling to a newer release.
Do it when a new tag appears on the
[releases page](https://github.com/LasVegasForTransit/repository-tooling/releases), or when
`pnpm check:repository-tooling` tells you a managed file drifted and you want it restored.

## Before you start

- `.lvbt/repository-tooling.json` exists in the repository. If it does not, follow
  [Adopt the organization tooling](adopt-repository-tooling.md) instead.
- The working tree is clean, so the update is the only thing in the diff you review.

## 1. Preview, then apply

```bash
pnpm repository-tooling:update --release v0.2.1 --dry-run
pnpm repository-tooling:update --release v0.2.1
```

The command clones that tag from GitHub into a temporary directory, replaces every managed path
with the release's copy, removes managed files the release no longer ships, updates the release
reference in `.claude/settings.json`, and rewrites the pin. It never edits scaffolded or
repository-owned files.

## 2. Verify and review

```bash
pnpm install
pnpm check:repository-tooling
git diff --stat
```

Expect changes only under the managed paths listed in
[Managed and scaffolded files](../reference/managed-files.md), plus `.claude/settings.json` and
`.lvbt/repository-tooling.json`. Anything else in the diff was not caused by the update.

## 3. Commit

```bash
git add -A
git commit -m "chore(dx): update repository tooling to v0.2.1"
```

## Migrating from a schema 1 pin

Repositories adopted before v0.2.0 have a pin without `schemaVersion` and their own
`scripts/check-repository-tooling.ts`. Run the update once with `--release v0.2.0` or newer; it
rewrites the pin to schema 2 and vendors the shared CLI. Then delete the repository's own check
script and point `check:repository-tooling` at `node .lvbt/repository-tooling/cli.mjs check` (the
update patches `package.json` for you; remove the old script file by hand).

## Common problems

**`git clone ... failed`**: the tag does not exist or GitHub is unreachable. Check the tag name on
the releases page. To update from a local checkout instead, pass `--source <dir> --ref <tag>`.

**`check` fails after the update with "Claude does not load the pinned organization plugin"**:
`.claude/settings.json` was edited by hand after the update. Re-run the update; it rewrites only
the `lvbt` marketplace entry and leaves your other settings alone.
