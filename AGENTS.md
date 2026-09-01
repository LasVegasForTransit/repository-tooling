# Working in repository-tooling

Run `pnpm check` after every change. Keep the human-facing templates free of hidden markers and
agent instructions.

This repository is a pnpm workspace that follows Turborepo conventions. `packages/` holds the shared
packages every LVBT repository installs: `eslint-config`, `typescript-config`, `prettier-config`,
`vitest-config`, and `cli` (the `lvbt` command, the git hooks under `hooks/`, the contribution
plugin under `plugins/`, and the organization version catalog in `catalog.json`). `examples/` holds
the repositories `create-turbo` copies; each is a complete, runnable Turborepo workspace, and a test
proves it passes its own checks. The catalog in every `pnpm-workspace.yaml` here must match
`packages/cli/catalog.json`; a test fails when they differ.

A change to anything a consumer installs (`packages/*`) or copies (`examples/*`) is a release: bump
the version in every package manifest and the root `package.json` together, update the tag the
examples pin, and describe what changes for consumers in the release notes. Never edit a file in a
consumer repository to change a shared rule; change the package here so every repository gets it.

Changes to the organization contribution workflow must update its tests, both plugin manifests, and
the published community-health files in `LasVegasForTransit/.github` in the same rollout.

Use the `github-contribution` skill and its helper for issue or pull request creation. Do not call
`gh issue create`, `gh pr create`, or equivalent API or connector methods directly.

Commit scopes are optional. The repository's [`.lvbt/commit-scopes.txt`](.lvbt/commit-scopes.txt)
file is the complete list of durable boundaries for this repository. Do not invent a scope for a
feature, file, or task; omit it when the change crosses boundaries.

Nothing is published or tagged from this repository without the maintainer's explicit approval. The
publish workflow runs only by hand.
