# Command reference

`lvbt` is the binary of `@lvbt/cli`. A repository's standard scripts call it, so you normally run
`pnpm bootstrap`, `pnpm preflight`, and `pnpm deploy` rather than the binary. It needs Node.js 24 or
newer and git.

## Commands

| Command          | Purpose                                                                  | Exit code                   |
| ---------------- | ------------------------------------------------------------------------ | --------------------------- |
| `lvbt bootstrap` | `pnpm install`, then `lvbt preflight`                                    | as preflight                |
| `lvbt preflight` | Check Node, pnpm, dependencies, git hooks, scopes, and Cloudflare access | 0 pass, 1 fail              |
| `lvbt deploy`    | `pnpm build`, then `pnpm exec wrangler deploy`                           | 0 done, 2 nothing to deploy |
| `lvbt help`      | Print usage                                                              | 0                           |

`lvbt deploy --dry-run` builds and runs `wrangler deploy --dry-run`.

## Preflight checks

Each failing check prints the command that fixes it.

| Check         | Passes when                                       | Fix it prints                                 |
| ------------- | ------------------------------------------------- | --------------------------------------------- |
| Node.js       | the running version satisfies `engines.node`      | install Node.js 24                            |
| pnpm          | `pnpm --version` equals `packageManager`          | `corepack prepare pnpm@<version> --activate`  |
| dependencies  | `node_modules` exists                             | `pnpm install`                                |
| git hooks     | `core.hooksPath` is `.githooks`                   | `pnpm install` (the prepare script sets it)   |
| commit scopes | `.lvbt/commit-scopes.txt` exists                  | copy it from the example and list your scopes |
| Cloudflare    | no wrangler config, or `wrangler whoami` succeeds | `pnpm exec wrangler login`                    |

## Standard scripts

Every repository's root `package.json` carries these, as `examples/package/package.json` shows.
Workspace packages carry `lint`, `check-types`, `test`, and `build` where they build, which is what
`turbo run` fans out to.

| Script                    | Command                                                |
| ------------------------- | ------------------------------------------------------ |
| `bootstrap`               | `lvbt bootstrap`                                       |
| `preflight`               | `lvbt preflight`                                       |
| `build` / `dev`           | `turbo run build` / `turbo run dev`                    |
| `lint`                    | `turbo run lint`                                       |
| `check-types`             | `turbo run check-types`                                |
| `test`                    | `turbo run test`                                       |
| `format` / `format:check` | `prettier --write .` / `prettier --check .`            |
| `check`                   | `pnpm format:check && turbo run lint check-types test` |
| `check:fix`               | `pnpm format && turbo run lint -- --fix`               |
| `prepare`                 | `git config --local core.hooksPath .githooks`          |
| `deploy` (deployable)     | `lvbt deploy`                                          |

## Git hooks

The hooks under `.githooks/` are three-line stubs that run the shared scripts in
`node_modules/@lvbt/cli/hooks/`: `commit-msg.sh` validates the subject against the organization
grammar and `.lvbt/commit-scopes.txt`, `prepare-commit-msg.sh` adds a `Co-Authored-By` footer when a
coding agent drives the commit, and `pre-push.sh` runs `pnpm check`. Repository-specific steps go
below the shared call in the stub.
