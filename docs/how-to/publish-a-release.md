# Publish a tooling release

This guide cuts a new release of `repository-tooling` so consumer repositories can update to it.
A release is a git tag; nothing is published to npm.

## Before you start

- The change is merged to `main` and CI is green.
- You have decided the new version. Bump the minor version when a managed file changes or the
  CLI gains behavior; bump the patch version for documentation and test-only changes.

## Steps

1. Set the version in four places to the same value: `package.json`,
   `plugins/lvbt-contributions/.claude-plugin/plugin.json`,
   `plugins/lvbt-contributions/.codex-plugin/plugin.json`, and `.claude-plugin/marketplace.json`.
   `pnpm check` fails if the plugin manifests disagree.
2. Commit with `chore(tooling): release v0.2.1`.
3. Tag and push:

   ```bash
   git tag v0.2.1
   git push origin main v0.2.1
   ```

4. Create the GitHub release from the tag with the `gh release create v0.2.1 --generate-notes`
   command, then edit the notes so the first line says what changes for consumers.
5. Update every registered repository (`standards/repositories.json`) by following
   [Update a repository](update-repository-tooling.md) in each one. Renovate does not track git
   tags for this repository, so this step is manual until every consumer runs the update in CI.
