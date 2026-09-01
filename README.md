# LVBT repository tooling

This repository is the source of truth for the LVBT repository standard: the shape every Las Vegans
for Better Transit repository has, the commands it answers to, and the rules it checks.

It owns four things:

- the shared packages every repository depends on: `@lvbt/tsconfig`, `@lvbt/eslint-config`,
  `@lvbt/prettier-config`, `@lvbt/vitest-config`, and `@lvbt/repository-tooling` (git hooks, the
  `lvbt-contributions` agent plugin, and the `bootstrap`, `preflight`, and `deploy` commands);
- the generator that writes a new repository from the standard and reports drift in an existing one;
- the GitHub issue forms and pull request template published by
  [`LasVegasForTransit/.github`](https://github.com/LasVegasForTransit/.github);
- the default-branch ruleset applied to every active organization repository.

A generated repository is a conventional TypeScript repository. Its configs are one-liners that
extend the shared packages, its hooks call into the installed package, and nothing in it is
bookkeeping for this tool. Standardization happens through the packages, not through files only LVBT
would recognize.

## Generate a repository

From a directory with a minimal `package.json`:

```bash
npx --yes github:LasVegasForTransit/repository-tooling#v0.2.0 init --profile package --scopes core,docs,ci,dx
pnpm bootstrap
pnpm check
```

Profiles: `package` (a library, CLI, or worker workspace), `site` (an Astro site), `app` (a Vite and
React application). The shared packages install straight from this repository's git tags, so nobody
needs a registry token.

## Every repository answers to the same commands

| Command          | What it does                                             |
| ---------------- | -------------------------------------------------------- |
| `pnpm bootstrap` | Install dependencies, wire git hooks, and run preflight  |
| `pnpm preflight` | Confirm the machine can build and deploy this repository |
| `pnpm check`     | Format check, lint, typecheck, and tests, in that order  |
| `pnpm check:fix` | Apply formatting and lint fixes                          |
| `pnpm build`     | Produce the deployable output                            |
| `pnpm deploy`    | Build, then `wrangler deploy` (deployable profiles)      |
| `pnpm test`      | Run the unit tests under `tests/`                        |

Guides, the command reference, and the list of generated files are in [`docs/`](docs/README.md).

## Contribution rules the packages enforce

Pull requests lead with the outcome for a person using the product, then explain the material
behavior or trade-off in complete prose. Follow-ups name unfinished product or reliability
objectives rather than repository chores. Conventional `feat` titles are reserved for capabilities
people can use or observe; internal groundwork uses a more precise type.

Commit scopes are optional and repository-owned. Every repository declares its durable boundaries in
[`.lvbt/commit-scopes.txt`](.lvbt/commit-scopes.txt); the shared validator reads that file for both
commit hooks and pull-request titles. A cross-boundary change omits its scope; a feature name, file
name, task name, or contributor role is never a scope.

## Working on this repository

Run the complete local check with:

```bash
pnpm check
```

It formats, lints, and runs every test under `tests/`, including an end-to-end run that generates a
repository into a temporary directory and proves it passes its own `pnpm check` with the shared
packages. This repository consumes its own packages and hooks.

TransitMapper is the reference consumer. Repository scopes are complete local policy: the shared
tooling supplies the subject grammar and enforcement path, not an organization-wide domain
vocabulary. A repository that needs to weaken another shared contribution rule requires a documented
exception in [`standards/repositories.json`](standards/repositories.json).
