# Create a repository

This guide starts a new LVBT repository that has the same structure, commands, and rules as every
other one. The standard is a GitHub template repository, so creating one is a button click, and the
shared rules arrive as ordinary dependencies.

## Before you start

- You can create repositories in the `LasVegasForTransit` organization.
- Node.js 24 or newer and git are installed on your machine. pnpm is activated by Corepack if it is
  missing (`corepack enable`).
- You know the repository's durable commit scopes: the two to six boundaries a change can belong to,
  such as `web`, `worker`, `docs`, `ci`, `dx`. A scope is never a feature, file, task, or role.

## 1. Create the repository from the template

Either open
[LasVegasForTransit/template-package](https://github.com/LasVegasForTransit/template-package) and
press **Use this template → Create a new repository**, or from a terminal:

```bash
gh repo create LasVegasForTransit/<your-repo> --template LasVegasForTransit/template-package --public --clone
cd <your-repo>
```

The template is published from `examples/package` in this repository on every release, so it is
always the current standard. (Turborepo's own scaffolder works too, from any release:
`npx create-turbo@latest --example https://github.com/LasVegasForTransit/repository-tooling/tree/main/examples/package`.)

## 2. Bootstrap and check

```bash
pnpm bootstrap
pnpm check
```

`bootstrap` installs dependencies (the `prepare` script points git at `.githooks`), then runs
`preflight`, which confirms Node, pnpm, hooks, and Cloudflare access and names the fix for anything
missing. `check` runs the format check, then lint, typecheck, and tests through Turborepo, exactly
as CI does. Both pass on a fresh copy. The `@lvbt/*` packages install from a git tag of this
repository, so no registry login is needed.

## 3. Make it yours

- Rename the root package in `package.json`.
- Rename `packages/example` to your first real package, or scaffold one with `turbo gen workspace`
  and delete the sample.
- Replace the scopes in `.lvbt/commit-scopes.txt` with this repository's boundaries.
- `.github/workflows/ci.yml` runs a job named `Validate`. Keep that name: the organization ruleset
  requires it on every pull request. Add steps to the job.
- `AGENTS.md` carries the paragraphs agents need. Add repository-specific guidance below them.

Renovate keeps the standard current: it opens one grouped pull request titled "LVBT repository
standard" whenever this repository tags a release.

## 4. Commit and register

```bash
git add -A
git commit -m "chore(dx): start from the LVBT repository standard"
git push
```

Then add the repository's name to `standards/repositories.json` here so the organization ruleset
applies.

## Common problems

**`pnpm install` cannot resolve `@lvbt/...`**: the tag in the dependency specifier does not exist
yet, or GitHub is unreachable. Check the releases page. For work on an unreleased standard, point
the specifiers at a local checkout with `link:../repository-tooling/packages/<name>`.

**`turbo` cannot find a task**: every package must declare `lint`, `check-types`, and `test` scripts
(and `build` where it builds). Copy them from `packages/example/package.json`.

**The commit hook rejects your scope**: the scope is not in `.lvbt/commit-scopes.txt`. Add it if it
is a durable boundary, or omit the scope.
