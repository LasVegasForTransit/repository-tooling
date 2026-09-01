# The shared packages

Every LVBT repository depends on these packages. They install from this repository's git tags, so
the dependency specifier names the release:

```json
"@lvbt/tsconfig": "github:LasVegasForTransit/repository-tooling#v0.2.0&path:/packages/tsconfig"
```

All packages share one version, the tooling version. Renovate groups their bumps into one pull
request titled "LVBT repository standard".

| Package                    | What a repository gets                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `@lvbt/tsconfig`           | `base.json` (strict, ES2024, bundler resolution), `node.json`, `browser.json`, `worker.json` to extend          |
| `@lvbt/eslint-config`      | `lvbt({ tsconfigRootDir, ignores, extend })`: type-checked TypeScript rules, Node globals for JS, Prettier last |
| `@lvbt/prettier-config`    | The Prettier settings object: 100 columns, single quotes, trailing commas, wrapped prose                        |
| `@lvbt/vitest-config`      | `lvbt(overrides)`: tests under `tests/`, empty suites fail                                                      |
| `@lvbt/repository-tooling` | The generator, the git hooks, the `lvbt-contributions` agent plugin, and the version catalog                    |

## How a repository uses them

```js
// eslint.config.mjs
import { lvbt } from '@lvbt/eslint-config';
export default lvbt({ tsconfigRootDir: import.meta.dirname });
```

```json
// tsconfig.json
{ "extends": "@lvbt/tsconfig/node.json", "include": ["src", "tests"] }
```

```sh
# .githooks/commit-msg
sh "$ROOT/node_modules/@lvbt/repository-tooling/hooks/commit-msg.sh" "$@"
```

A repository that needs more than the shared rule adds to it in its own file: pass `extend` to the
ESLint config, spread the Prettier object and add plugins, or add lines below the hook's call. The
shared floor stays shared.

## The version catalog

`packages/repository-tooling/catalog.json` is the organization's pinned version of every tool. The
generator writes it into each repository's `pnpm-workspace.yaml`, where packages refer to it with
`"catalog:"`. This repository's own `pnpm-workspace.yaml` carries the same block, and a test fails
when the two disagree.

## Publishing

The packages carry `publishConfig.registry` for GitHub Packages, but publishing is optional and
manual. See [Publish a tooling release](../how-to/publish-a-release.md).
