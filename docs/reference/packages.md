# The shared packages

Every LVBT repository depends on these packages. They install from this repository's git tags, so
the dependency specifier names the release:

```json
"@lvbt/typescript-config": "github:LasVegasForTransit/repository-tooling#v0.2.0&path:/packages/typescript-config"
```

All packages share one version, the tooling version. Renovate groups their bumps into one pull
request titled "LVBT repository standard".

| Package                   | What a repository gets                                                                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@lvbt/typescript-config` | `base.json` (strict, ES2024, bundler resolution), `node.json`, `browser.json`, `worker.json`, `react-library.json`                                       |
| `@lvbt/eslint-config`     | `config` arrays from `./base` and `./react-internal`: type-checked TypeScript rules, Turborepo env-var rule, Prettier last. Owns its plugin dependencies |
| `@lvbt/prettier-config`   | The Prettier settings object: 100 columns, single quotes, trailing commas, wrapped prose                                                                 |
| `@lvbt/vitest-config`     | `sharedConfig`: tests under `tests/`, empty suites fail                                                                                                  |
| `@lvbt/cli`               | The `lvbt` command, the git hooks, the `lvbt-contributions` agent plugin, and the version catalog                                                        |

## How a package uses them

```js
// packages/<name>/eslint.config.js
import { config } from '@lvbt/eslint-config/base';
export default config;
```

```json
// packages/<name>/tsconfig.json
{ "extends": "@lvbt/typescript-config/node.json", "include": ["src", "tests"] }
```

```ts
// packages/<name>/vitest.config.ts
import { defineConfig } from 'vitest/config';
import { sharedConfig } from '@lvbt/vitest-config';
export default defineConfig({ ...sharedConfig });
```

```js
// prettier.config.js (repository root)
import config from '@lvbt/prettier-config';
export default config;
```

A package that needs more than the shared rule adds to it in its own file: spread the ESLint array
and append blocks, spread the Prettier object and add plugins, spread `sharedConfig` and override.
The shared floor stays shared.

## The version catalog

`packages/cli/catalog.json` is the organization's pinned version of every tool. Every example's
`pnpm-workspace.yaml` carries the same block, where packages refer to it with `"catalog:"`, and so
does this repository's own. A test fails when any of them disagree.

## Publishing

The packages carry `publishConfig.registry` for GitHub Packages, but publishing is optional and
manual. See [Publish a tooling release](../how-to/publish-a-release.md).
