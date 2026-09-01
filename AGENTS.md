# Working in repository-tooling

Run `pnpm check` after every change. Keep the human-facing templates free of hidden markers and
agent instructions.

This repository is a pnpm workspace. `packages/repository-tooling` holds the generator (`src/`), the
git hooks (`hooks/`), the contribution plugin (`plugins/`), the files the generator writes
(`templates/`), and the organization version baseline (`catalog.json`). The other packages under
`packages/` are the configs every repository extends. The root `pnpm-workspace.yaml` catalog must
match `catalog.json`; a test fails when they differ.

A change to anything a consumer installs (`packages/*`) is a release: bump the version in every
package manifest and the root `package.json` together, and describe what changes for consumers in
the release notes. Never edit a generated file in a consumer repository to change a shared rule;
change the package here so every repository gets it.

Template files that would be read as live configuration inside this package carry a neutral name and
are renamed on output (`lint.config.mjs.tmpl` becomes `eslint.config.mjs`; see
`src/lib/templates.mjs`).

Changes to the organization contribution workflow must update its tests, both plugin manifests, and
the published community-health files in `LasVegasForTransit/.github` in the same rollout.

Use the `github-contribution` skill and its helper for issue or pull request creation. Do not call
`gh issue create`, `gh pr create`, or equivalent API or connector methods directly.

Commit scopes are optional. The repository's [`.lvbt/commit-scopes.txt`](.lvbt/commit-scopes.txt)
file is the complete list of durable boundaries for this repository. Do not invent a scope for a
feature, file, or task; omit it when the change crosses boundaries.

Nothing is published or tagged from this repository without the maintainer's explicit approval. The
publish workflow runs only by hand.
