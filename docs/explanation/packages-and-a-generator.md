# Why packages and a generator

Every LVBT repository should have the same structure and the same behavior: the same commands, the
same lint rules, the same TypeScript strictness, the same hooks, the same CI job. This page explains
how that is achieved without giving each repository a pile of files that only this tool understands.

## The standard is a set of packages

Rules that must be identical everywhere live in packages: `@lvbt/eslint-config`,
`@lvbt/prettier-config`, `@lvbt/tsconfig`, `@lvbt/vitest-config`, and `@lvbt/repository-tooling` for
hooks, the agent plugin, and the operational commands. A repository extends them in one-line
configs, the way it would extend any third-party preset. A change to a rule is a version bump,
reviewed once here and delivered by Renovate everywhere. Nothing needs to be re-vendored, hashed, or
compared.

The packages install from this repository's git tags. GitHub Packages would require every volunteer
to hold a token before `pnpm install` works, and the public npm registry is not where
organization-internal presets belong. A tag needs neither.

## The generator writes conventional files

What cannot be a package is written by the generator: the hook scripts git needs on disk, the
harness files Claude Code and Codex read, the CI workflow, and the one-line configs that point at
the packages. After generation the repository owns them. A contributor who has never heard of LVBT
sees a normal TypeScript repository with normal files.

The generator never overwrites on its own. `init` skips files that exist, `diff` reports what
differs from the current standard, and `apply` takes the standard's version of the files you name.
Drift is a decision a maintainer makes in a diff, not something a tool silently corrects or silently
forbids.

## What was rejected, and why

An earlier design vendored the plugin into each repository and recorded per-file digests in a pin
file that a check compared on every run. It guaranteed byte-identical copies, but at the cost of a
registry in source that only this tool could read, a lifecycle command repositories depended on, and
a second mechanism beside the package manager for delivering versions. The package manager already
does that job.

A design with a managed configuration directory that repository configs extended was rejected for
the same reason: it standardized through files specific to LVBT rather than through packages any
tool understands.

## What this costs

The organization must keep the packages small and stable, because every repository feels a change to
them. A repository that needs to diverge does so in its own file, on top of the shared rule, and
says why in the commit. And a release still needs a tag, a set of release notes, and one dependency
bump per repository, which Renovate turns into pull requests.
