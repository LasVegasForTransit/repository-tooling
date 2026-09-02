# The example repositories

Each directory under `examples/` is a complete Turborepo workspace that `create-turbo` copies to
start a new repository, and that a template repository mirrors. It is the standard, in runnable
form: a test in this repository copies each example into a temporary directory and proves it passes
its own `check` with the shared packages.

| Example | For                                                 | Template repository | Status  |
| ------- | --------------------------------------------------- | ------------------- | ------- |
| `basic` | A library, CLI, or Cloudflare Worker workspace      | `template-basic`    | current |
| `site`  | An Astro site deployed to Cloudflare                | `template-site`     | planned |
| `app`   | A Vite and React application deployed to Cloudflare | `template-app`      | planned |

## What `examples/basic` contains

| Path                                         | Purpose                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `package.json`                               | The standard scripts, lint-staged, and the `@lvbt/cli` and Prettier deps                         |
| `pnpm-workspace.yaml`                        | `apps/*`, `packages/*`, and the organization version catalog                                     |
| `turbo.json`                                 | `build`, `lint`, `check-types`, `test`, `test:e2e`, `dev` tasks                                  |
| `prettier.config.js`                         | Extends `@lvbt/prettier-config`                                                                  |
| `.markdownlint-cli2.jsonc`                   | Documentation rules, including that every relative link resolves                                 |
| `.gitleaks.toml`                             | Secret scanning exemptions for the lockfile and design records                                   |
| `.githooks/`                                 | Stubs that run the shared hooks from `node_modules/@lvbt/cli`                                    |
| `.codex/hooks.json`, `.agents/plugins/`      | Codex loads the plugin from `node_modules` and runs its guard                                    |
| `.claude/settings.json`                      | Claude Code loads the plugin from the release tag, formats on edit, and cannot read secret files |
| `.github/workflows/ci.yml`                   | The `Validate` job: `pnpm check`, dependency audit, secret scan                                  |
| `.github/actions/setup-node-pnpm/action.yml` | Node from `package.json`, pinned pnpm, frozen install                                            |
| `.github/renovate.json`                      | Weekly grouped updates; `@lvbt/*` bumps grouped as one                                           |
| `.github/CODEOWNERS`                         | The maintainers team reviews everything                                                          |
| `.lvbt/commit-scopes.txt`                    | Placeholder scopes to replace                                                                    |
| `docs/`                                      | The index, a start-here tutorial, and a glossary                                                 |
| `AGENTS.md`, `README.md`                     | Agent guidance and the repository's own front page                                               |
| `packages/example/`                          | A sample package with `lint`, `check-types`, `test`, `build`                                     |
| `apps/`                                      | Empty; deployable apps go here                                                                   |

Everything in a copied repository belongs to that repository. The example is not tracked afterwards;
the packages carry the rules that must stay identical everywhere.

## Adding an example

Copy `examples/basic`, change what the profile needs, and add it to the table above and to the loop
in `tests/example.test.mjs` so it is proven on every check. Keep the standard scripts and the
catalog identical across examples.
