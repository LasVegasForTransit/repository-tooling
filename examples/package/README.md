# LVBT package repository

A Turborepo workspace following the LVBT repository standard. It was created with:

```bash
npx create-turbo@latest --example https://github.com/LasVegasForTransit/repository-tooling/tree/main/examples/package
```

## Getting started

```bash
pnpm bootstrap   # install, wire git hooks, run preflight
pnpm check       # the same check CI runs
```

Then rename the root package and `packages/example`, and replace the scopes in
`.lvbt/commit-scopes.txt` with this repository's boundaries.

## Layout

- `apps/` for deployable applications and services
- `packages/` for libraries and tools; `packages/example` shows the shape of one

Lint, format, TypeScript, and test settings extend the `@lvbt/*` packages from
[`LasVegasForTransit/repository-tooling`](https://github.com/LasVegasForTransit/repository-tooling).
