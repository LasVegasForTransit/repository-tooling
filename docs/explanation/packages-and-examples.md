# Why packages and examples

Every LVBT repository should have the same structure and the same behavior: the same commands, the
same lint rules, the same TypeScript strictness, the same hooks, the same CI job. This page explains
how that is achieved with nothing that a developer who has never heard of LVBT would find unusual.

## Turborepo's conventions, not ours

Turborepo already defines how a JavaScript monorepo shares configuration: `packages/eslint-config`
exporting a `config` per environment, `packages/typescript-config` with JSON files to extend,
`packages/vitest-config` exporting a shared object, `turbo.json` naming the tasks, and
`create-turbo --example` copying a runnable example to start a new repository. This repository does
exactly that under the `@lvbt` scope. A new contributor can read Turborepo's documentation and
understand every file.

## Rules travel as packages

Anything that must be identical everywhere lives in a package: the ESLint and TypeScript rules, the
Prettier settings, the Vitest defaults, the git hooks, the agent plugin, and the operational
commands `bootstrap`, `preflight`, and `deploy`. A repository extends them in one-line configs. A
change to a rule is a version bump, reviewed once here and delivered by Renovate everywhere. Nothing
needs to be re-vendored, hashed, or compared.

The packages install from this repository's git tags. GitHub Packages would require every volunteer
to hold a token before `pnpm install` works, and the public npm registry is not where
organization-internal presets belong. A tag needs neither.

## Structure travels as examples

What cannot be a package is a file the repository owns: the hook stubs git needs on disk, the
harness files Claude Code and Codex read, the CI workflow, and the one-line configs. Those come from
the example `create-turbo` copies. After that the repository owns them, the way every repository
created from a template does. No tool tracks them afterwards, because the rules they point at are in
the packages, and a package bump is what changes behavior.

## What was rejected, and why

An earlier design vendored the plugin into each repository and recorded per-file digests in a pin
file that a check compared on every run. A second design added a generator with placeholders and
`diff` and `apply` commands. Both standardized through mechanisms only LVBT would recognize. The
package manager and `create-turbo` already do those jobs, so the standard uses them.

## What this costs

The organization must keep the packages small and stable, because every repository feels a change to
them. A repository that needs to diverge does so in its own file, on top of the shared rule, and
says why in the commit. And a release still needs a tag, release notes, and one dependency bump per
repository, which Renovate turns into pull requests.
