# LVBT repository tooling

This repository is the source of truth for the LVBT repository standard: the shape every Las Vegans
for Better Transit repository has, the commands it answers to, and the rules it checks. It follows
[Turborepo](https://turborepo.dev) conventions throughout, so nothing here is specific to LVBT
except the rules themselves.

It owns four things:

- the shared packages every repository depends on: `@lvbt/eslint-config`, `@lvbt/typescript-config`,
  `@lvbt/prettier-config`, `@lvbt/vitest-config`, and `@lvbt/cli` (the `lvbt` command for
  `bootstrap`, `preflight`, and `deploy`, the git hooks, and the `lvbt-contributions` agent plugin);
- the example repositories under `examples/` that `create-turbo` copies to start a new repository;
- the GitHub issue forms and pull request template published by
  [`LasVegasForTransit/.github`](https://github.com/LasVegasForTransit/.github);
- the default-branch ruleset applied to every active organization repository.

## Create a repository

Press **Use this template** on the template that matches what the repository ships:
[template-basic](https://github.com/LasVegasForTransit/template-basic) for libraries, CLIs, and
Workers; [template-with-astro](https://github.com/LasVegasForTransit/template-with-astro) for an
Astro site;
[template-with-vite-react](https://github.com/LasVegasForTransit/template-with-vite-react) for a
Vite and React application. Or, from a terminal:

```bash
gh repo create LasVegasForTransit/<your-repo> --template LasVegasForTransit/template-basic --public --clone
cd <your-repo>
pnpm bootstrap
pnpm check
```

Each template is published from the matching directory under `examples/` here on every release. The
shared packages install from this repository's git tags, so nobody needs a registry token, and
Renovate opens one grouped pull request per release to keep every repository current. Inside a
repository, `turbo gen workspace` scaffolds a new package or app.

## Every repository answers to the same commands

| Command           | What it does                                                    |
| ----------------- | --------------------------------------------------------------- |
| `pnpm bootstrap`  | Install dependencies, wire git hooks, and run preflight         |
| `pnpm preflight`  | Confirm the machine can build and deploy this repository        |
| `pnpm check`      | Format check, then lint, typecheck, and tests through Turborepo |
| `pnpm check:fix`  | Apply formatting and lint fixes                                 |
| `pnpm build`      | Build every package                                             |
| `pnpm run deploy` | Build, then `wrangler deploy` (deployable repositories)         |
| `pnpm test`       | Run every package's tests                                       |

Guides, the command reference, and the package reference are in [`docs/`](docs/README.md).

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

It formats, lints, and runs every test under `tests/`, including one that copies each example into a
temporary directory and proves it passes its own checks with the shared packages. This repository
consumes its own packages and hooks.

TransitMapper is the reference consumer. Repository scopes are complete local policy: the shared
tooling supplies the subject grammar and enforcement path, not an organization-wide domain
vocabulary. A repository that needs to weaken another shared contribution rule requires a documented
exception in [`standards/repositories.json`](standards/repositories.json).
