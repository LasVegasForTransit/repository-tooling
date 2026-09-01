# Command reference

The generator is the `lvbt-repository-tooling` binary of `@lvbt/repository-tooling`. In a repository
that has installed the package, run it with `pnpm exec lvbt-repository-tooling`; the standard
scripts `bootstrap`, `preflight`, and `deploy` call it for you. To generate a repository that has
nothing installed yet, run the same binary from a release:
`npx --yes github:LasVegasForTransit/repository-tooling#<tag> ...`.

It needs Node.js 24 or newer and git, and nothing from a registry.

## Commands

| Command     | Purpose                                                                  | Exit code                       |
| ----------- | ------------------------------------------------------------------------ | ------------------------------- |
| `init`      | Write the standard into this repository; existing files are skipped      | 0 done, 2 bad usage             |
| `diff`      | Report standard files that are missing or differ from what `init` writes | 0 matches, 1 drift, 2 bad usage |
| `apply`     | Overwrite the named files with the standard's version                    | 0 done, 2 bad usage             |
| `bootstrap` | `pnpm install`, then `preflight`                                         | as preflight                    |
| `preflight` | Check Node, pnpm, dependencies, hooks, scopes, and Cloudflare access     | 0 pass, 1 fail                  |
| `deploy`    | `pnpm build`, then `pnpm exec wrangler deploy`                           | 0 done, 2 nothing to deploy     |
| `help`      | Print usage                                                              | 0                               |

## Options

| Option             | Applies to                | Meaning                                                                        |
| ------------------ | ------------------------- | ------------------------------------------------------------------------------ |
| `--profile <name>` | `init`, `diff`, `apply`   | `package`, `site`, or `app`. Required for `init`; otherwise inferred from deps |
| `--scopes <a,b,c>` | `init`                    | Required. Lowercase, hyphenated commit scopes for `.lvbt/commit-scopes.txt`    |
| `--local <dir>`    | `init`                    | Write `link:` dependencies to a local checkout instead of git-tag dependencies |
| `--dry-run`        | `init`, `apply`, `deploy` | Print what would happen and change nothing                                     |

`diff` and `apply` infer the profile: `astro` in the dependencies means `site`, `vite` means `app`,
anything else means `package`. Pass `--profile` to override.

## Preflight checks

| Check         | Passes when                                       | Fix it prints                                |
| ------------- | ------------------------------------------------- | -------------------------------------------- |
| Node.js       | the running version satisfies `engines.node`      | install Node.js 24                           |
| pnpm          | `pnpm --version` equals `packageManager`          | `corepack prepare pnpm@<version> --activate` |
| dependencies  | `node_modules` exists                             | `pnpm install`                               |
| git hooks     | `core.hooksPath` is `.githooks`                   | `pnpm install` (the prepare script sets it)  |
| commit scopes | `.lvbt/commit-scopes.txt` exists                  | `init --profile ... --scopes ...`            |
| Cloudflare    | no wrangler config, or `wrangler whoami` succeeds | `pnpm exec wrangler login`                   |

## Standard scripts

`init` adds these to `package.json` without replacing scripts that already exist.

| Script                    | Every profile                                                   |
| ------------------------- | --------------------------------------------------------------- |
| `bootstrap`               | `lvbt-repository-tooling bootstrap`                             |
| `preflight`               | `lvbt-repository-tooling preflight`                             |
| `check`                   | `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` |
| `check:fix`               | `pnpm format && pnpm lint:fix`                                  |
| `format` / `format:check` | `prettier --write .` / `prettier --check .`                     |
| `lint` / `lint:fix`       | `eslint .` / `eslint . --fix`                                   |
| `typecheck`               | `tsc --noEmit -p tsconfig.json`                                 |
| `test` / `test:watch`     | `vitest run` / `vitest`                                         |
| `prepare`                 | `git config --local core.hooksPath .githooks`                   |

| Script     | `package`                    | `site`                           | `app`                            |
| ---------- | ---------------------------- | -------------------------------- | -------------------------------- |
| `dev`      |                              | `astro dev`                      | `vite`                           |
| `build`    | `tsc -p tsconfig.build.json` | `astro build`                    | `vite build`                     |
| `preview`  |                              | `astro preview`                  | `vite preview`                   |
| `deploy`   |                              | `lvbt-repository-tooling deploy` | `lvbt-repository-tooling deploy` |
| `test:e2e` |                              | `playwright test`                | `playwright test`                |
