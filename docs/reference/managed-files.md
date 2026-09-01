# Managed and scaffolded files

The tooling owns two kinds of files in a consumer repository. The list lives in
`bin/lib/manifest.mjs`; this page is the human-readable copy.

## Managed files

Copied on every `init` and `update`, hashed into the pin, and failed by `check` when edited
locally. Change them in this repository, release, and update consumers.

| Path in a consumer                              | Source in this repository                                   | What it is                                                |
| ----------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------- |
| `plugins/lvbt-contributions/`                   | `plugins/lvbt-contributions/`                               | The agent plugin: skill, creation helper, guards, validator |
| `.lvbt/repository-tooling/`                     | `bin/`                                                      | This CLI, so `check` and `update` run without a download   |
| `.githooks/commit-msg`                          | `templates/managed/.githooks/commit-msg`                    | Shared subject validation, then `.lvbt/hooks/commit-msg`   |
| `.githooks/prepare-commit-msg`                  | `templates/managed/.githooks/prepare-commit-msg`            | Agent attribution footer                                   |
| `.agents/plugins/marketplace.json`              | `templates/managed/.agents/plugins/marketplace.json`        | Codex loads the vendored plugin                            |
| `.codex/hooks.json`                             | `templates/managed/.codex/hooks.json`                       | Codex creation guard                                       |
| `.github/actions/setup-node-pnpm/action.yml`    | `templates/managed/.github/actions/setup-node-pnpm/action.yml` | Node 24 + pinned pnpm + frozen install for every workflow |

### Extending a managed hook

Managed hooks are the same in every repository. A repository that needs more commit rules puts
them in `.lvbt/hooks/commit-msg`, an executable script that receives the message file path. The
managed hook runs it only after the shared subject check passes, so the shared rule can never be
weakened locally.

## Scaffolded files

Written by `init` only when absent. The repository owns them afterwards; `update` never touches
them and `check` only inspects the properties listed in the [command reference](cli.md).

| Path                          | Purpose                                                          |
| ----------------------------- | ---------------------------------------------------------------- |
| `.githooks/pre-push`          | Runs `pnpm check` before a push                                  |
| `.github/workflows/ci.yml`    | The `Validate` job the organization ruleset requires             |
| `AGENTS.md`                   | The paragraphs agents need; extend below them                    |
| `.gitignore`                  | Node, build output, and local secret files                       |
| `.lvbt/commit-scopes.txt`     | Generated from `--scopes`                                        |

## Patched files

`init` and `update` edit these in place and preserve everything else in them.

| Path                     | What changes                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `.claude/settings.json`  | `extraKnownMarketplaces.lvbt` points at the pinned ref; `enabledPlugins` enables it |
| `package.json`           | The three consumer scripts                                                          |

## Commit scopes

A scope names a durable boundary a change can belong to. Good scopes for a web repository:
`web`, `worker`, `core`, `docs`, `ci`, `dx`. A feature name, file name, task name, or contributor
role is never a scope, and a change that crosses boundaries omits the scope. The shared validator
reads `.lvbt/commit-scopes.txt` from the repository being committed to, so this repository never
imposes its vocabulary on another.
