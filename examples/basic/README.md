# LVBT package repository

A Turborepo workspace following the LVBT repository standard. Create a repository with
[LasVegasForTransit/template-basic](https://github.com/LasVegasForTransit/template-basic) using
**Use this template**, then clone your new repository. The generated standard is vendored, so local
setup does not need GitHub Packages authentication.

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

Lint, format, TypeScript, and test settings extend the `@lasvegasfortransit/*` packages from
[`LasVegasForTransit/repository-tooling`](https://github.com/LasVegasForTransit/repository-tooling).
