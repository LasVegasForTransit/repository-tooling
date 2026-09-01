# Create a repository

This guide starts a new LVBT repository that has the same structure, commands, and rules as every
other one. It uses Turborepo's own `create-turbo` to copy one of the example repositories in this
repository, so there is no LVBT-specific tool to learn.

## Before you start

- Node.js 24 or newer and git are installed. pnpm is activated by Corepack if it is missing
  (`corepack enable`).
- You know which example fits: `package` for a library, CLI, or worker workspace. (Site and app
  examples for Astro and Vite are planned; until they exist, start from `package` and add the
  framework.)
- You know the repository's durable commit scopes: the two to six boundaries a change can belong to,
  such as `web`, `worker`, `docs`, `ci`, `dx`. A scope is never a feature, file, task, or role.

## 1. Copy the example

```bash
npx create-turbo@latest --example https://github.com/LasVegasForTransit/repository-tooling/tree/main/examples/package
```

`create-turbo` asks for the directory name, copies the example, runs `git init`, and installs
dependencies. The `@lvbt/*` packages install from a git tag of this repository, so no registry login
is needed.

## 2. Bootstrap and check

```bash
cd <your-repo>
pnpm bootstrap
pnpm check
```

`bootstrap` installs dependencies (the `prepare` script points git at `.githooks`), then runs
`preflight`, which confirms Node, pnpm, hooks, and Cloudflare access and names the fix for anything
missing. `check` runs the format check, then lint, typecheck, and tests through Turborepo, exactly
as CI does. Both pass on a fresh copy.

## 3. Make it yours

- Rename the root package in `package.json` and rename `packages/example` to your first real
  package, or scaffold one with `turbo gen workspace`.
- Replace the scopes in `.lvbt/commit-scopes.txt` with this repository's boundaries.
- `.github/workflows/ci.yml` runs a job named `Validate`. Keep that name: the organization ruleset
  requires it on every pull request. Add steps to the job.
- `AGENTS.md` carries the paragraphs agents need. Add repository-specific guidance below them.

## 4. Commit and publish the repository

```bash
git add -A
git commit -m "chore(dx): start from the LVBT repository standard"
```

Create the GitHub repository under `LasVegasForTransit` and add it to `standards/repositories.json`
here so the organization ruleset applies.

## Common problems

**`pnpm install` cannot resolve `@lvbt/...`**: the tag in the dependency specifier does not exist
yet, or GitHub is unreachable. Check the releases page. For work on an unreleased standard, point
the specifiers at a local checkout with `link:../repository-tooling/packages/<name>`.

**`turbo` cannot find a task**: every package must declare `lint`, `check-types`, and `test` scripts
(and `build` where it builds). Copy them from `packages/example/package.json`.

**The commit hook rejects your scope**: the scope is not in `.lvbt/commit-scopes.txt`. Add it if it
is a durable boundary, or omit the scope.
