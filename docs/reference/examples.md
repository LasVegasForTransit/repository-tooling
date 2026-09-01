# The example repositories

Each directory under `examples/` is a complete Turborepo workspace that `create-turbo` copies to
start a new repository. It is the standard, in runnable form: a test in this repository copies each
example into a temporary directory and proves it passes its own `check` with the shared packages.

| Example   | For                                                 | Status  |
| --------- | --------------------------------------------------- | ------- |
| `package` | A library, CLI, or Cloudflare Worker workspace      | current |
| `site`    | An Astro site deployed to Cloudflare                | planned |
| `app`     | A Vite and React application deployed to Cloudflare | planned |

## What `examples/package` contains

| Path                                         | Purpose                                                       |
| -------------------------------------------- | ------------------------------------------------------------- |
| `package.json`                               | The standard scripts and the `@lvbt/cli` and Prettier deps    |
| `pnpm-workspace.yaml`                        | `apps/*`, `packages/*`, and the organization version catalog  |
| `turbo.json`                                 | `build`, `lint`, `check-types`, `test`, `dev` tasks           |
| `prettier.config.js`                         | Extends `@lvbt/prettier-config`                               |
| `.githooks/`                                 | Stubs that run the shared hooks from `node_modules/@lvbt/cli` |
| `.codex/hooks.json`, `.agents/plugins/`      | Codex loads the plugin from `node_modules` and runs its guard |
| `.claude/settings.json`                      | Claude Code loads the plugin from the release tag             |
| `.github/workflows/ci.yml`                   | The `Validate` job the organization ruleset requires          |
| `.github/actions/setup-node-pnpm/action.yml` | Node 24, pinned pnpm, frozen install                          |
| `.github/renovate.json`                      | Weekly grouped updates; `@lvbt/*` bumps grouped as one        |
| `.lvbt/commit-scopes.txt`                    | Placeholder scopes to replace                                 |
| `AGENTS.md`, `README.md`                     | Agent guidance and the repository's own front page            |
| `packages/example/`                          | A sample package with `lint`, `check-types`, `test`, `build`  |
| `apps/`                                      | Empty; deployable apps go here                                |

Everything in a copied repository belongs to that repository. The example is not tracked afterwards;
the packages carry the rules that must stay identical everywhere.

## Adding an example

Copy `examples/package`, change what the profile needs, and add it to the table above and to the
loop in `tests/example.test.mjs` so it is proven on every check. Keep the standard scripts and the
catalog identical across examples.
