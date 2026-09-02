# The shared packages

Every LVBT repository depends on these packages. They install from this repository's git tags, so
the dependency specifier names the release:

```json
"@lvbt/typescript-config": "github:LasVegasForTransit/repository-tooling#v0.2.0&path:/packages/typescript-config"
```

All packages share one version, the tooling version. Renovate groups their bumps into one pull
request titled "LVBT repository standard".

| Package                   | What a repository gets                                                                                                                                                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@lvbt/typescript-config` | `base.json` (strict, ES2024, bundler resolution, unchecked-index and unused checks), `node.json`, `browser.json`, `worker.json`, `react-library.json`, and `astro.json` (the browser target with the options Astro's own strict config sets, inlined so no second copy of Astro is ever resolved) |
| `@lvbt/eslint-config`     | `config` arrays from `./base`, `./browser` (base plus browser globals), and `./react-internal`: strict and stylistic type-checked rules, suppression hygiene, shape caps, four SonarJS rules, the Turborepo env rule, Prettier last. Owns its plugins                                             |
| `@lvbt/prettier-config`   | The Prettier settings object: 100 columns, single quotes, trailing commas, wrapped prose                                                                                                                                                                                                          |
| `@lvbt/vitest-config`     | `sharedConfig`: unit tests under `tests/`, empty suites fail                                                                                                                                                                                                                                      |
| `@lvbt/playwright-config` | `sharedConfig`: end-to-end tests under `tests/e2e/*.spec.ts`, desktop and mobile projects, traces on failure, retries in CI                                                                                                                                                                       |
| `@lvbt/cli`               | The `lvbt` command (`bootstrap`, `preflight`, `check`, `deploy`), the git hooks, the `lvbt-contributions` agent plugin, and the version catalog                                                                                                                                                   |

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

```ts
// apps/<name>/playwright.config.ts
import { defineConfig } from '@playwright/test';
import { sharedConfig } from '@lvbt/playwright-config';
export default defineConfig({
  ...sharedConfig,
  webServer: { command: 'pnpm preview', url: 'http://127.0.0.1:4321' },
  use: { ...sharedConfig.use, baseURL: 'http://127.0.0.1:4321' },
});
```

```js
// prettier.config.js (repository root)
import config from '@lvbt/prettier-config';
export default config;
```

A package that needs more than the shared rule adds to it in its own file: spread the ESLint array
and append blocks, spread the Prettier object and add plugins, spread `sharedConfig` and override.
The shared floor stays shared.

## Lint level

The baseline is deliberately strict, because the alternative is three repositories each deciding
what strict means. Findings that exist when a repository adopts it go into
`eslint-suppressions.json` through `eslint --suppress-all`; `lvbt check debt` then makes sure that
ledger only shrinks, and a file with suppressions has to get better when it is touched.

## The version catalog

`packages/cli/catalog.json` is the organization's pinned version of every tool. Every example's
`pnpm-workspace.yaml` carries the same block, where packages refer to it with `"catalog:"`, and so
does this repository's own. A test fails when any of them disagree.

## Publishing

The packages carry `publishConfig.registry` for GitHub Packages, but publishing is optional and
manual. See [Publish a tooling release](../how-to/publish-a-release.md).
