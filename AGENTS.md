# Working in repository-tooling

Run `pnpm check` after every change. Keep the human-facing templates free of
hidden markers and agent instructions.

Changes to the organization contribution workflow must update its tests, both
plugin manifests, and the published community-health files in
`LasVegasForTransit/.github` in the same rollout.

Use the `github-contribution` skill and its helper for issue or pull request
creation. Do not call `gh issue create`, `gh pr create`, or equivalent API or
connector methods directly.

Commit scopes are optional. When a change is confined to one durable boundary,
use only `web`, `worker`, `core`, `pwa`, `dx`, `tooling`, or `ci`.
Do not invent a scope for a feature, file, or task; omit it when the change
crosses boundaries.
