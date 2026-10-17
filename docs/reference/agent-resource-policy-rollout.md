# Agent resource policy coverage

Inventory reconciled on 2026-10-17 from the organization repository list and the default-branch Git
tree of each registered repository. The ten active repositories exactly match
[`standards/repositories.json`](../../standards/repositories.json). No active repository is omitted.
All consumer trees have one root `AGENTS.md` and no tracked `CLAUDE.md` or nested project agent
files outside their vendored standard. Repository-tooling also has the three example `AGENTS.md`
files.

| Repository               | Main standard at inventory | Policy rollout state                                  |
| ------------------------ | -------------------------- | ----------------------------------------------------- |
| .github                  | v0.7.8                     | Pending canonical release                             |
| analytics                | v0.7.8                     | Pending canonical release                             |
| labs                     | v0.7.8                     | Pending canonical release                             |
| repository-tooling       | Source                     | Policy and source reference in this change            |
| template-basic           | v0.7.8                     | Updated basic example ready for template publication  |
| template-with-astro      | v0.7.8                     | Updated Astro example ready for template publication  |
| template-with-vite-react | v0.7.8                     | Updated Vite example ready for template publication   |
| transit-mapper           | v0.7.3                     | Existing v0.7.8 PR #182 open; leave its branch intact |
| website                  | v0.7.8                     | Pending canonical release                             |
| week-without-driving     | v0.7.8                     | Pending canonical release                             |

The archived `labs-migration-smoke` and `labs-migration-source-smoke` repositories are excluded from
active rollout. Local `gis` is not a Git repository; `website-private-candidates` is an additional
checkout, not another active organization repository. Neither is covered by the registered updater.
Do not claim those local folders or the archived repositories have adopted this policy.

## Release and acceptance

1. Review and merge the upstream policy change after validation. Obtain maintainer approval before
   tagging or publishing. Keep the canonical text in repository-tooling.
2. Use the existing daily `Standard update` workflows and template publication. They vendor one
   release and run its own migration. Do not create parallel manual policy PRs or overwrite #182.
3. For each adoption, require `Validate` green, compare `.lvbt/agent-resource-policy.md`
   byte-for-byte with the adopted bundle's `standards/agent-resource-policy.md`, and check the
   visible root agent reference. Confirm all repositories reach the same release, commit and policy
   text before claiming organization-wide adoption. Organization inventory warns on absent or
   divergent policy references; its existing release-lag check detects repositories behind the
   canonical release.
4. Keep resource acceptance local or mocked. A policy rollout does not authorize load generation,
   schedule activation, paid upgrades, permission changes or production migrations. Operational D1
   repair and migration verification remain separate work.

This change prepares the canonical source, all three examples, automatic consumer migration and
warning checks. It does not assert that any consumer default branch has already adopted the policy.
