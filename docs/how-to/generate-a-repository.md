# Generate a repository from the standard

This guide creates a new LVBT repository, or brings an existing one onto the standard, with one
command. Afterwards the repository has the same structure, the same commands, and the same rules as
every other LVBT repository, and it depends on the shared `@lvbt/*` packages like any other
dependency. Use it when you start a repository or adopt the standard in one that predates it.

## Before you start

- Node.js 24 or newer and git are installed. pnpm is installed by `pnpm bootstrap` through Corepack
  if it is missing.
- The repository is a git checkout with a `package.json`. A new repository needs only
  `{"name": "@lvbt/<repo>", "private": true}`.
- You know the repository's profile: `package` for a library, CLI, or worker workspace; `site` for
  an Astro site; `app` for a Vite and React application.
- You know its durable commit scopes: the two to six boundaries a change can belong to, such as
  `web`, `worker`, `docs`, `ci`, `dx`. A scope is never a feature, file, task, or role.

## 1. Run the generator from the latest release

From the repository root:

```bash
npx --yes github:LasVegasForTransit/repository-tooling#v0.2.0 init --profile package --scopes core,docs,ci,dx
```

Replace `v0.2.0` with the newest tag on the
[releases page](https://github.com/LasVegasForTransit/repository-tooling/releases). The command
prints what it writes, skips, and merges:

```
Generating a package repository from the LVBT standard v0.2.0
  write   .agents/plugins/marketplace.json
  write   .codex/hooks.json
  write   .editorconfig
  write   .githooks/commit-msg
  write   .githooks/pre-push
  write   .githooks/prepare-commit-msg
  write   .github/actions/setup-node-pnpm/action.yml
  write   .github/renovate.json
  write   .github/workflows/ci.yml
  write   .gitignore
  write   .prettierignore
  write   AGENTS.md
  write   eslint.config.mjs
  write   pnpm-workspace.yaml
  write   prettier.config.mjs
  write   src/index.ts
  write   tests/index.test.ts
  write   tsconfig.build.json
  write   tsconfig.json
  write   vitest.config.mjs
  write   .lvbt/commit-scopes.txt
  merge   .claude/settings.json
  merge   package.json
```

Add `--dry-run` first to see this list without writing anything. A file the repository already has
is skipped, never overwritten; `package.json` and `.claude/settings.json` are merged, and everything
they already declare is kept.

## 2. Bootstrap and check

```bash
pnpm bootstrap
pnpm check
```

`bootstrap` installs dependencies (the `prepare` script points git at `.githooks`), then runs
`preflight`, which confirms Node, pnpm, hooks, and Cloudflare access and names the fix for anything
missing. `check` runs the format check, lint, typecheck, and tests exactly as CI does.

## 3. Make it yours

The generator writes starting points that the repository grows:

- `src/index.ts` and `tests/index.test.ts` are a sample; replace them.
- `.github/workflows/ci.yml` runs a job named `Validate`. Keep that name: the organization ruleset
  requires it on every pull request. Add steps to the job.
- `AGENTS.md` carries the paragraphs agents need. Add repository-specific guidance below them.
- `.lvbt/commit-scopes.txt` lists the scopes you passed. Edit it as boundaries change.
- `pnpm-workspace.yaml` lists `apps/*`, `packages/*`, and `tools/*` and carries the organization
  version catalog. Add or remove workspace globs freely.

## 4. Commit

```bash
git add -A
git commit -m "chore(dx): adopt the LVBT repository standard"
```

The commit hook is already active, so this is the first commit it validates.

## Common problems

**`init needs --scopes`** or **`init needs --profile`**: the generator refuses to guess. Pass both.

**`Run this inside a repository that has a package.json`**: create the minimal one shown above.

**`pnpm install` cannot resolve `@lvbt/...`**: the tag in the dependency specifier does not exist
yet. Check the releases page, or for pre-release work pass `--local <path-to-checkout>` to `init`,
which writes `link:` dependencies to a local checkout of this repository.

**Prettier or ESLint reports a file the generator wrote**: run `pnpm check:fix`. The generated files
are formatted with the standard's own settings, so this only happens after a hand edit.
