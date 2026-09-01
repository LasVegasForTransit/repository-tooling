# Command reference

The lifecycle CLI is `bin/cli.mjs` in this repository and `.lvbt/repository-tooling/cli.mjs` in
every consumer. Consumers run the vendored copy so the check and the files it checks come from one
release. It needs Node.js 24 or newer and git, and nothing from npm.

## Commands

| Command  | Purpose                                                                                 | Exit code                   |
| -------- | --------------------------------------------------------------------------------------- | --------------------------- |
| `init`   | Vendor the managed files into a repository that has no pin, and scaffold the rest       | 0 done, 2 bad usage         |
| `update` | Replace the managed files from another release and rewrite the pin                     | 0 done, 2 bad usage         |
| `check`  | Verify the vendored files match the pin and the repository still wires them up          | 0 pass, 1 fail, 2 bad usage |
| `help`   | Print usage                                                                             | 0                           |

## Options

| Option              | Applies to     | Meaning                                                                                                   |
| ------------------- | -------------- | --------------------------------------------------------------------------------------------------------- |
| `--scopes <a,b,c>`  | `init`         | Required. Lowercase, hyphenated commit scopes written to `.lvbt/commit-scopes.txt`.                       |
| `--release <tag>`   | `init`, `update` | Clone this tag of `LasVegasForTransit/repository-tooling` and vendor from it.                            |
| `--source <dir>`    | `init`, `update` | Vendor from a local checkout instead of cloning. Used by tests and when developing the tooling itself.    |
| `--ref <tag>`       | `init`, `update` | Tag name to record in the pin when `--source` is not checked out at a tag.                               |
| `--dry-run`         | `init`, `update` | Print the plan and write nothing.                                                                        |

When neither `--release` nor `--source` is given, `init` run from a checkout of this repository
vendors from that checkout; run from a consumer it fails and asks for `--release`.

## Consumer package scripts

`init` adds these to `package.json`, and `check` requires them:

| Script                      | Command                                        |
| --------------------------- | ---------------------------------------------- |
| `prepare`                   | `git config --local core.hooksPath .githooks`  |
| `check:repository-tooling`  | `node .lvbt/repository-tooling/cli.mjs check`  |
| `repository-tooling:update` | `node .lvbt/repository-tooling/cli.mjs update` |

An existing `prepare` script that does not already set the hooks path is prefixed with the
command rather than replaced.

## What `check` verifies

Each failure prints on its own line, prefixed `repository tooling:`, and names the fix.

1. `.lvbt/repository-tooling.json` exists, uses schema 2, and points at the organization repository.
2. Every file under the managed paths hashes to what the pin recorded; a mismatch names the files.
3. Both plugin manifests name the pinned plugin and version.
4. `.claude/settings.json` registers the `lvbt` marketplace at the pinned ref and enables the plugin.
5. `.agents/plugins/marketplace.json` loads the vendored plugin; `.codex/hooks.json` runs the guard.
6. The managed hooks exist and are executable.
7. `.lvbt/commit-scopes.txt` exists with valid, unique scopes.
8. `package.json` pins pnpm and carries the three consumer scripts.
9. A workflow under `.github/workflows/` has a job named `Validate` that runs `pnpm check`.
10. `AGENTS.md` requires the `github-contribution` skill and `github-create.mjs` helper.
11. No local `.github/ISSUE_TEMPLATE/` or `.github/pull_request_template.md` shadows the
    organization defaults.
