# Adopt the organization tooling in a repository

This guide installs the shared LVBT contribution tooling into a repository that does not have it
yet: the `lvbt-contributions` agent plugin, the commit hooks, the harness wiring for Claude Code
and Codex, the CI setup action, and the pin file that lets `pnpm check:repository-tooling` prove
nothing drifted. Use it when you create a new repository or bring an older one up to the standard.

## Before you start

- You have a checkout of the repository with a `package.json` that sets `"packageManager"` to a
  pnpm version, for example `"pnpm@11.15.1"`.
- Node.js 24 or newer and git are installed. Nothing else is needed; the tooling has no
  dependencies.
- You know the repository's durable commit scopes: the two to six boundaries a change can belong
  to, such as `web`, `worker`, `docs`, `ci`, `dx`. A scope is never a feature, file, task, or role.
  See [commit scopes](../reference/managed-files.md#commit-scopes) if unsure.

## 1. Run `init` from the latest release

From the repository root:

```bash
npx --yes github:LasVegasForTransit/repository-tooling#v0.2.0 init --scopes web,worker,docs,ci,dx
```

Replace `v0.2.0` with the newest tag on the
[releases page](https://github.com/LasVegasForTransit/repository-tooling/releases) and the scopes
with yours. The command prints every file it vendors, scaffolds, or patches, for example:

```
Adopting LasVegasForTransit/repository-tooling v0.2.0 (1a2b3c4)
  vendor   plugins/lvbt-contributions
  vendor   .lvbt/repository-tooling
  vendor   .githooks/commit-msg
  vendor   .githooks/prepare-commit-msg
  vendor   .agents/plugins/marketplace.json
  vendor   .codex/hooks.json
  vendor   .github/actions/setup-node-pnpm/action.yml
  scaffold .githooks/pre-push
  scaffold .github/workflows/ci.yml
  scaffold AGENTS.md
  scaffold .gitignore
  scaffold .lvbt/commit-scopes.txt
  patch    .claude/settings.json
  patch    package.json
  write    .lvbt/repository-tooling.json
```

Add `--dry-run` first to see this list without writing anything.

If `npx` cannot reach GitHub, clone the release and run the same command from the clone:

```bash
git clone --depth 1 --branch v0.2.0 https://github.com/LasVegasForTransit/repository-tooling.git /tmp/repository-tooling
node /tmp/repository-tooling/bin/cli.mjs init --scopes web,worker,docs,ci,dx
```

## 2. Install and verify

```bash
pnpm install
pnpm check:repository-tooling
```

`pnpm install` runs the `prepare` script the tool added, which points git at `.githooks`. The
check prints one line when everything matches:

```
repository tooling: lvbt-contributions 0.2.0 matches v0.2.0; managed files verified; organization templates are inherited.
```

## 3. Review the scaffolded files

`init` writes these only when they are missing, and never touches them again. Read each one and
adjust it to the repository:

- `.github/workflows/ci.yml` runs a job named `Validate`. Keep that name: the organization ruleset
  requires it on every pull request. Add your own steps to the job.
- `.githooks/pre-push` runs `pnpm check`. If the repository has no `check` script yet, add one.
- `AGENTS.md` carries the paragraphs agents need. Add repository-specific guidance below them.
- `.lvbt/commit-scopes.txt` lists the scopes you passed. Edit the list as boundaries change.

If the repository already had a `.githooks/commit-msg` with extra rules, move those rules into
`.lvbt/hooks/commit-msg` (make it executable). The managed hook runs it after the shared subject
check passes.

## 4. Commit the adoption as one change

```bash
git add -A
git commit -m "chore(dx): adopt organization repository tooling"
```

The commit hook is already active, so this commit is the first one it validates.

## Common problems

**`init needs --scopes`**: the tool refuses to guess your boundaries. Pass at least one scope.

**`.lvbt/repository-tooling.json already exists; run update instead of init`**: the repository
already adopted the tooling. Follow [Update a repository](update-repository-tooling.md).

**`Run this inside a repository that has a package.json`**: create a minimal one first with
`{"name": "<repo>", "private": true, "packageManager": "pnpm@11.15.1"}`.

**`check` says a file differs from the pinned release**: someone edited a managed file locally.
Move the change into `LasVegasForTransit/repository-tooling` so every repository gets it, then
restore the file with `pnpm repository-tooling:update --release <the pinned tag>`.
