# Adopt the standard in an existing repository

This guide brings a repository that predates the standard, or one that still carries the older
vendored plugin and pin file, onto the shared packages and commands. The result is the same as a
repository created from the example, reached by copying files from it.

## Before you start

- The working tree is clean, so the adoption is the only thing in the diff you review.
- You have a checkout of this repository, or the [examples/basic](../../examples/basic) directory
  open on GitHub, to copy from. For an Astro site or a Vite and React app, also keep
  [examples/with-astro](../../examples/with-astro) or
  [examples/with-vite-react](../../examples/with-vite-react) open: their `apps/*` directories show
  the app-level files (`wrangler.jsonc`, `playwright.config.ts`, the tsconfig target).

## 1. Add the shared packages

In the root `package.json`, add the dev dependencies and the standard scripts exactly as
`examples/basic/package.json` declares them (`bootstrap`, `preflight`, `check`, `check:fix`,
`format`, `format:check`, `lint`, `check-types`, `test`, `build`, `dev`, `prepare`). In each
workspace package, add `@lvbt/eslint-config`, `@lvbt/typescript-config`, and `@lvbt/vitest-config`
as `examples/basic/packages/example/package.json` does, and give it `lint`, `check-types`, `test`,
and `build` scripts.

Copy the `catalog:` block of `examples/basic/pnpm-workspace.yaml` into yours and switch tool
versions to `catalog:`. Copy `turbo.json` if the repository has none.

## 2. Copy the standard files

Copy these from the example, overwriting your versions:

- `.githooks/commit-msg`, `.githooks/prepare-commit-msg`, `.githooks/pre-push`
- `.codex/hooks.json` and `.agents/plugins/marketplace.json`
- `.github/actions/setup-node-pnpm/action.yml` and `.github/renovate.json`
- `.editorconfig`, `.prettierignore`, `prettier.config.js`

Merge these by hand, keeping what the repository already has:

- `.claude/settings.json`: the `lvbt` marketplace entry and `enabledPlugins`
- `.github/workflows/ci.yml`: a job named `Validate` that runs `pnpm check`
- `AGENTS.md`: the standard paragraphs above your own

Point each package's `eslint.config.js`, `tsconfig.json`, and `vitest.config.ts` at the shared
packages as the example does. Move any repository-specific lint rules into the package config after
the shared one.

## 3. Remove the old mechanism

If the repository was adopted before v0.2.0, delete `plugins/lvbt-contributions/`,
`.lvbt/repository-tooling.json`, `scripts/check-repository-tooling.ts`, and the
`check:repository-tooling` script. Keep `.lvbt/commit-scopes.txt`.

## 4. Verify and commit

```bash
pnpm bootstrap
pnpm check
git add -A
git commit -m "chore(dx): adopt the LVBT repository standard"
```
