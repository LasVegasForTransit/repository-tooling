# Command reference

`lvbt` is the binary of `@lvbt/cli`. A repository's standard scripts call it, so you normally run
`pnpm bootstrap`, `pnpm preflight`, `pnpm check`, and `pnpm run deploy` rather than the binary. It
needs Node.js 24.18 or newer and git.

## Commands

| Command                    | Purpose                                                                             | Exit code                   |
| -------------------------- | ----------------------------------------------------------------------------------- | --------------------------- |
| `lvbt bootstrap`           | `pnpm install`, then `lvbt preflight`                                               | as preflight                |
| `lvbt preflight`           | Check Node, pnpm, dependencies, git hooks, scopes, GitHub CLI, Cloudflare           | 0 pass, 1 fail              |
| `lvbt check [name ...]`    | The shared repository-shape rules: `filenames`, `contract`, `debt` (all by default) | 0 pass, 1 fail, 2 bad usage |
| `lvbt deploy [--filter x]` | `pnpm build`, then `wrangler deploy` in every app with a wrangler config            | 0 done, 2 nothing to deploy |
| `lvbt help`                | Print usage                                                                         | 0                           |

`lvbt check filenames --staged` checks the staged tree, which the pre-commit hook uses.
`lvbt deploy --dry-run` builds and runs `wrangler deploy --dry-run`; `--filter apps/worker` limits
it to one app.

## Preflight checks

Each failing check prints the command that fixes it.

| Check         | Passes when                                       | Fix it prints                                 |
| ------------- | ------------------------------------------------- | --------------------------------------------- |
| Node.js       | the running version satisfies `engines.node`      | install the version `engines.node` names      |
| pnpm          | `pnpm --version` equals `packageManager`          | `corepack prepare pnpm@<version> --activate`  |
| dependencies  | `node_modules` exists                             | `pnpm install`                                |
| git hooks     | `core.hooksPath` is `.githooks`                   | `pnpm install` (the prepare script sets it)   |
| commit scopes | `.lvbt/commit-scopes.txt` exists                  | copy it from the example and list your scopes |
| GitHub CLI    | `gh auth status` succeeds                         | `brew install gh && gh auth login`            |
| Cloudflare    | no wrangler config, or `wrangler whoami` succeeds | `pnpm exec wrangler login`                    |

## Shape checks

| Check       | Enforces                                                                                                                                                                                     |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `filenames` | Under `apps/*` and `packages/*`: `src/` files are `<name>.<ext>`; tests are `<name>.test.ts(x)`; `.spec.ts(x)` only under `tests/e2e/`                                                       |
| `contract`  | Every package that ships code declares `lint`, `check-types`, `test`; every dependency is `catalog:`, `workspace:`, a repository-tooling tag, or `link:`; test material lives under `tests/` |
| `debt`      | `eslint-suppressions.json` ledgers never grow against `main`, and a changed file that carries suppressions shrinks (fewer findings or lines)                                                 |

## Standard scripts

Every repository's root `package.json` carries these, as `examples/basic/package.json` shows.
Workspace packages carry `lint`, `check-types`, `test`, and `build` where they build, which is what
`turbo run` fans out to.

| Script                    | Command                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| `bootstrap`               | `lvbt bootstrap`                                                                          |
| `preflight`               | `lvbt preflight`                                                                          |
| `build` / `dev`           | `turbo run build` / `turbo run dev`                                                       |
| `lint`                    | `turbo run lint`                                                                          |
| `check-types`             | `turbo run check-types`                                                                   |
| `test` / `test:e2e`       | `turbo run test` / `turbo run test:e2e`                                                   |
| `format` / `format:check` | `prettier --write .` / `prettier --check .`                                               |
| `check`                   | `pnpm format:check && markdownlint-cli2 && lvbt check && turbo run lint check-types test` |
| `check:fix`               | `pnpm format && markdownlint-cli2 --fix && turbo run lint -- --fix`                       |
| `prepare`                 | `git config --local core.hooksPath .githooks`                                             |
| `deploy` (deployable)     | `lvbt deploy`                                                                             |

## Git hooks

The hooks under `.githooks/` are stubs that run the shared scripts in
`node_modules/@lvbt/cli/hooks/`. Repository-specific steps go below the shared call in the stub.

| Hook                 | Shared behavior                                                                                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pre-commit`         | Prettier on the staged files through lint-staged; gitleaks on the staged changes when it is installed (CI scans regardless)                                                              |
| `prepare-commit-msg` | Adds a `Co-Authored-By` footer when a coding agent drives the commit                                                                                                                     |
| `commit-msg`         | Conventional subject ≤ 72 characters with a scope from `.lvbt/commit-scopes.txt`; a body for `feat` and `fix`, wrapped at 72; attribution required and well-placed when an agent commits |
| `pre-push`           | `pnpm check`                                                                                                                                                                             |
