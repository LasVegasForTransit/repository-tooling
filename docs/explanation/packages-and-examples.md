# Why packages and examples

Every LVBT repository should have the same structure and the same behavior: the same commands, the
same lint rules, the same TypeScript strictness, the same hooks, the same CI job. This page explains
how that is achieved with nothing that a developer who has never heard of LVBT would find unusual.

## Turborepo's conventions, not ours

Turborepo already defines how a JavaScript monorepo shares configuration: `packages/eslint-config`
exporting a `config` per environment, `packages/typescript-config` with JSON files to extend,
`packages/vitest-config` exporting a shared object, `turbo.json` naming the tasks, and
`create-turbo --example` copying a runnable example to start a new repository. This repository does
exactly that under the `@lasvegasfortransit` scope. A new contributor can read Turborepo's
documentation and understand every file.

## Rules travel as packages

Anything that must be identical everywhere lives in a package: the ESLint and TypeScript rules, the
Prettier settings, the Vitest defaults, the git hooks, the agent plugin, and the operational
commands `bootstrap`, `preflight`, and `deploy`. A repository extends them in one-line configs. A
change to a rule is a versioned preset update, reviewed once here and then reviewed as one coherent
vendor diff in each consumer.

Template publication vendors the exact bytes from a repository-tooling tag under
`.lvbt/web-platform`, records their commit and content hash, and rewrites `@lasvegasfortransit/*`
dependencies to local `file:` paths. The source packages publish through the organization GitHub
Packages registry. The local snapshot needs neither registry credentials nor a network connection
after it is committed.

## Structure travels as examples

What cannot be a package is a file the repository owns: the hook stubs git needs on disk, the
harness files Claude Code and Codex read, the CI workflow, and the one-line configs. Those come from
the example copied into the template. Publication then adds the released vendor snapshot without
changing the authoritative example. Application-owned files remain application-owned; only the
vendor directory and its provenance record are replaced by `standards:update`. When a release
changes what those files must contain, such as a new generated folder that git must ignore, the
updater adds exactly that and reports the file, so every repository gets the fix from one reviewed
update.

## What was rejected, and why

An earlier design vendored only the contribution plugin and recorded per-file digests in a pin file.
That did not version the package rules, catalog, updater, and templates as one unit. The current
preset uses ordinary `file:` dependencies while one provenance record verifies the complete shared
snapshot. It does not generate or overwrite application-owned configuration.

## What this costs

The organization must keep the packages small and stable, because every repository feels a change to
them. A repository that needs to diverge does so in its own file, on top of the shared rule, and
says why in the commit. A release still needs a tag and release notes, followed by an explicit,
reviewed preset update in each repository.
