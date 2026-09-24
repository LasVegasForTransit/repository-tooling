# Command reference

`lvbt` is the binary of `@lasvegasfortransit/cli`. A repository's standard scripts call it, so you
normally run `pnpm bootstrap`, `pnpm preflight`, `pnpm check`, and `pnpm run deploy` rather than the
binary. It needs Node.js 24.20 or newer on the 24 line, and git.

## Commands

| Command                       | Purpose                                                                                           | Exit code                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------- |
| `lvbt bootstrap`              | `pnpm install`, then the preflight checks                                                         | as preflight                |
| `lvbt bootstrap --production` | The same, then set up everything the repository's `platform.json` declares, asking as it goes     | 0 ready, 1 open, 2 no tty   |
| `lvbt preflight`              | Check Node, pnpm, dependencies, git hooks, scopes, GitHub CLI, Cloudflare                         | 0 pass, 1 fail              |
| `lvbt preflight --production` | The same, then report whether production has everything `platform.json` declares; changes nothing | 0 ready, 1 not ready        |
| `lvbt check [name ...]`       | The shared repository-shape rules: `filenames`, `contract`, `debt`, `platform` (all by default)   | 0 pass, 1 fail, 2 bad usage |
| `lvbt deploy [--filter x]`    | `pnpm build`, then `wrangler deploy` in every app with a wrangler config                          | 0 done, 2 nothing to deploy |
| `lvbt help`                   | Print usage                                                                                       | 0                           |

`lvbt check filenames --staged` checks the staged tree, which the pre-commit hook uses.
`lvbt deploy --dry-run` builds and runs `wrangler deploy --dry-run`; `--filter apps/worker` limits
it to one app. With `--production`, `--filter apps/site` (or `site`) limits bootstrap and preflight
to that app's `platform.json`; `--filter .` picks the one at the root.

`lvbt bootstrap --production --rotate SIGNING_SECRET` replaces the stored value of a secret the
manifest declares; `--rotate` takes one name or several separated by commas, and only
`bootstrap --production` accepts it.

Through pnpm, the flags pass straight to the script: `pnpm bootstrap --production` and
`pnpm preflight --production`.

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

## Production checks

`lvbt preflight --production` and `lvbt bootstrap --production` read every `platform.json` at the
repository root and under `apps/*`. The [platform manifest reference](platform-manifest.md) lists
its fields. For each item, the report prints one line under its section:

| Mark   | Meaning                                                                                                       |
| ------ | ------------------------------------------------------------------------------------------------------------- |
| `ok`   | Production has it.                                                                                            |
| `FAIL` | Production needs it now and lacks it, has the wrong value, has a forbidden value, or it could not be checked. |
| `WARN` | It is missing, but only a feature that is not built yet needs it, or it is only recommended.                  |

Every line that is not `ok` is followed by `next:`, the action that fixes it. The summary line says
whether production is ready and counts what is needed now and what can wait. Preflight exits 1 when
any `FAIL` remains, so CI or a person can use it to verify production.

The command reads with the credentials already on the machine. Workers, D1, R2, and secret names
come through the Cloudflare API with the token `wrangler login` created. Email records come from
public DNS over HTTPS. GitHub environments and secret names come from `gh`. Turnstile and Access
need a Cloudflare API token with more permissions than Wrangler's sign-in has; interactive runs ask
for one, and non-interactive runs read it from `LVBT_CLOUDFLARE_SETUP_TOKEN`. Without it, those
items are reported as `FAIL` with "could not check".

`lvbt bootstrap --production` needs a terminal. It prints the same report, lists what it will do,
and asks once before starting. Then it:

- creates missing D1 databases and R2 buckets with Wrangler, and applies unapplied D1 migrations
  with `wrangler d1 migrations apply --remote`, which shows the migrations and asks to confirm.
  Migrations wait while the wrangler config names another `database_id`, because Wrangler applies
  them to the database the config names;
- creates or fixes Turnstile widgets and Access applications and their allow policies through the
  Cloudflare API, and stores the values a new resource produces (the widget's secret and the
  application's audience tag) on the Worker straight away, since any older copy is stale;
- stores each missing secret with `wrangler secret put` or `gh secret set --env`, sending the value
  on standard input: it generates values marked `generate`, copies values a resource or the manifest
  already has, and otherwise shows the secret's purpose, link, and numbered steps, offers to open
  the link, and asks for the value without echoing it;
- creates missing GitHub environments;
- offers to delete forbidden secrets it finds;
- shows numbered dashboard steps, and offers to open the page, for the things no API does: turning
  on Zero Trust, connecting Google Workspace, creating a Google Group an Access application admits,
  verifying an email domain in Resend, and editing `vars` in the wrangler config. For a Google
  Group, which it cannot read, it asks whether the group exists and remembers a yes in
  `~/.config/lvbt/confirmations.json` (or under `XDG_CONFIG_HOME`), a file that holds no secret.

Items that only a feature not built yet needs are offered after asking. Pressing Enter at any value
skips it. The run ends with a fresh report and exits 1 while anything required is still open;
running it again picks up exactly those items, because every run starts from what exists.

Every step checks before it acts, so running the command again on a finished setup changes nothing:
it says "Nothing was changed" and exits 0. It finds existing resources by name across every page of
Cloudflare's lists, so it never creates a second database, bucket, widget, application, or policy.
It never asks for, generates, or copies a secret that is already set, and it never edits the
wrangler config. A generated secret that is set on one target but missing from another is reported
rather than generated again, because a second random value would leave the targets disagreeing.
Replacing a stored value happens only with `--rotate`: a generated secret gets a new random value, a
typed one is asked for again, and one a Turnstile widget or Access application feeds is copied from
it again. The command asks before it replaces anything, and stores the new value on every target the
secret lists.

Secret values are held in memory only for the run and never written to disk, printed, or passed as
command-line arguments. The same goes for the Turnstile and Access token.

## Shape checks

| Check       | Enforces                                                                                                                                                                                                                                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `filenames` | Under `apps/*` and `packages/*`: `src/` files are `<name>.<ext>` (plus `.module.*`, `*.config.*`, `.gitkeep`); tests are `<name>.test.ts(x)`; `.spec.ts(x)` only under `tests/e2e/`; helpers and snapshots under `support/` or `snapshots/`                                                                 |
| `contract`  | Every package that ships code declares `lint`, `check-types`, `test`; every dependency is `catalog:`, `workspace:`, a repository-tooling tag, a verified vendored `file:` path, or `link:`; test material lives under `tests/`; every Astro package declares `sync`, and `turbo.json` runs it before `lint` |
| `platform`  | Every `platform.json` at the root or under `apps/*` matches the schema `@lasvegasfortransit/cli` ships and names only secrets and vars it declares; a repository without one passes                                                                                                                         |
| `debt`      | `eslint-suppressions.json` ledgers never grow against `main`, and a changed file that carries suppressions shrinks (fewer findings or lines)                                                                                                                                                                |

## Standard scripts

Every repository's root `package.json` carries these, as `examples/basic/package.json` shows.
Workspace packages carry `lint`, `check-types`, `test`, and `build` where they build, which is what
`turbo run` fans out to.

| Script                    | Command                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| `bootstrap`               | `lvbt bootstrap`                                                                                   |
| `preflight`               | `lvbt preflight`                                                                                   |
| `build` / `dev`           | `turbo run build` / `turbo run dev`                                                                |
| `lint`                    | `turbo run lint`                                                                                   |
| `check-types`             | `turbo run check-types`                                                                            |
| `test` / `test:e2e`       | `turbo run test` / `turbo run test:e2e --concurrency=1` (suites bind ports, so one at a time)      |
| `format` / `format:check` | `prettier --write .` / `prettier --check .`                                                        |
| `check`                   | `pnpm format:check && markdownlint-cli2 && lvbt check && turbo run lint check-types test validate` |
| `check:fix`               | `pnpm format && markdownlint-cli2 --fix && turbo run lint -- --fix`                                |
| `prepare`                 | `git config --local core.hooksPath .githooks`                                                      |
| `deploy` (deployable)     | `lvbt deploy`                                                                                      |

Each workspace package script runs one command. When a task needs more than one step, give each step
its own script and let Turbo order them, so it can cache and run each step separately. An Astro
site's `lint` depends on its `sync` task in the root `turbo.json`. A package with a second type
program, such as a Worker, declares `check-types:worker` beside `check-types`. Its own `turbo.json`
wires the two together, so `turbo run check-types` runs both:

```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "extends": ["//"],
  "tasks": {
    "check-types": { "dependsOn": ["^check-types", "check-types:worker"] },
    "check-types:worker": {}
  }
}
```

The root `check` and `check:fix` scripts are the exception. They run the repository-wide tools that
are not workspace tasks (Prettier, markdownlint, and `lvbt check`) and then hand over to Turbo, and
their commands stay exactly as the table shows.

## Repository-owned checks

The `validate` task is the extension point: a package (or the root, as `//#validate`) that declares
a `validate` script has it run as part of `pnpm check`, after lint, types, and tests. Repository
specific checks such as dead-code, duplication, or dependency-boundary scans live there, so the
`check` script itself stays identical in every repository.

## Git hooks

The hooks under `.githooks/` are stubs that run the shared scripts in
`node_modules/@lasvegasfortransit/cli/hooks/`. Repository-specific steps go below the shared call in
the stub.

| Hook                 | Shared behavior                                                                                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pre-commit`         | Prettier on the staged files through lint-staged; gitleaks on the staged changes when it is installed (CI scans regardless)                                                              |
| `prepare-commit-msg` | Adds a `Co-Authored-By` footer when a coding agent drives the commit                                                                                                                     |
| `commit-msg`         | Conventional subject ≤ 72 characters with a scope from `.lvbt/commit-scopes.txt`; a body for `feat` and `fix`, wrapped at 72; attribution required and well-placed when an agent commits |
| `pre-push`           | `pnpm check`                                                                                                                                                                             |
