# Generated files

What `init` writes, by profile. Templates live under
`packages/repository-tooling/templates/<layer>/`; the `common` layer applies to every profile and a
profile layer can replace a common file by shipping the same relative path.

Two kinds of file come out of the generator. **Standard** files are the same in every repository;
`diff` reports when one differs and `apply` restores it. **Repository-owned** files are starting
points; the generator writes them once and never looks at them again.

## Common layer

| File                                         | Kind             | Purpose                                                |
| -------------------------------------------- | ---------------- | ------------------------------------------------------ |
| `.githooks/commit-msg`                       | standard         | Runs the shared subject validator from `node_modules`  |
| `.githooks/prepare-commit-msg`               | standard         | Adds the agent attribution footer                      |
| `.githooks/pre-push`                         | standard         | Runs `pnpm check`                                      |
| `.codex/hooks.json`                          | standard         | Codex guard against direct issue or PR creation        |
| `.agents/plugins/marketplace.json`           | standard         | Codex loads the plugin from `node_modules`             |
| `.github/actions/setup-node-pnpm/action.yml` | standard         | Node 24, pinned pnpm, frozen install                   |
| `.github/renovate.json`                      | standard         | Weekly grouped updates; `@lvbt/*` bumps grouped as one |
| `.editorconfig`                              | standard         | Two-space, LF, final newline                           |
| `.prettierignore`                            | standard         | Ignores the lockfile                                   |
| `eslint.config.mjs`                          | standard         | Extends `@lvbt/eslint-config`                          |
| `prettier.config.mjs`                        | standard         | Extends `@lvbt/prettier-config`                        |
| `vitest.config.mjs`                          | standard         | Extends `@lvbt/vitest-config`                          |
| `.github/workflows/ci.yml`                   | repository-owned | The `Validate` job; add steps                          |
| `AGENTS.md`                                  | repository-owned | Agent guidance; extend below the standard paragraphs   |
| `.gitignore`                                 | repository-owned | Node, build output, secrets                            |
| `pnpm-workspace.yaml`                        | repository-owned | Workspace globs and the version catalog                |
| `.lvbt/commit-scopes.txt`                    | repository-owned | Generated from `--scopes`; edit as boundaries change   |

Merged rather than written: `package.json` (scripts, `devDependencies`, `packageManager`, `engines`,
`type`) and `.claude/settings.json` (the `lvbt` marketplace at the release tag).

## Profile layers

| Profile   | Files                                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------- |
| `package` | `tsconfig.json` (node), `tsconfig.build.json` (emits to `dist/`), sample `src/index.ts` and `tests/index.test.ts` |
| `site`    | `tsconfig.json` (browser, includes `.astro/types.d.ts`), `prettier.config.mjs` with the Astro plugin              |
| `app`     | `tsconfig.json` (browser), `eslint.config.mjs` with the React hooks rules                                         |

## Template naming

Inside this package a template cannot be named `eslint.config.mjs`, `prettier.config.mjs`, or
`vitest.config.mjs`: the tool would read it as the configuration for the files around it. Those
templates are stored as `lint.config.mjs.tmpl`, `format.config.mjs.tmpl`, and `test.config.mjs.tmpl`
and renamed on output. Any template may carry a `.tmpl` suffix, and `{{placeholders}}` are rendered
from the repository name, profile, scopes, release tag, and catalog.
