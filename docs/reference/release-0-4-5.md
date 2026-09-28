# Repository tooling 0.4.5

A repository's CI can now install private `@lasvegasfortransit/*` packages from GitHub Packages. The
examples' `.github/actions/setup-node-pnpm/action.yml` points `actions/setup-node` at
`https://npm.pkg.github.com` for the `@lasvegasfortransit` scope and passes the workflow token as
`NODE_AUTH_TOKEN` during `pnpm install`.

That action is a file the repository owns, so `pnpm standards:update` does not change it. A
repository that installs `@lasvegasfortransit/analytics` or another private package in CI copies the
`registry-url`, `scope`, and `NODE_AUTH_TOKEN` lines from the example's action.

The production setup guides also gained the last owner-verified steps for Cloudflare Access and
Google sign-in: check the Cloudflare account switcher for the correctly spelled account name, and
turn PKCE back off only if the Access login test fails with a code-verifier error.

These notes were written after the release, which shipped without them.
