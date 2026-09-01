# Publish a tooling release

This guide cuts a release of the standard so repositories can move to it. A release is a git tag;
consumers install the packages from that tag and `create-turbo` copies the examples from it, so
nothing has to be published to a registry. Publishing to GitHub Packages is optional, manual, and
only ever done with the maintainer's explicit approval.

## Before you start

- The change is merged to `main` and CI is green.
- You have decided the version. Bump the minor version when a package's behavior changes or an
  example changes shape; bump the patch version for documentation and test-only changes.

## 1. Set one version everywhere

The root `package.json`, every `packages/*/package.json`, both plugin manifests under
`packages/cli/plugins/lvbt-contributions/`, and `.claude-plugin/marketplace.json` carry the same
version. The examples pin the `@lvbt/*` dependencies and the Claude marketplace ref to the tag
`v<version>`. `pnpm check` fails when any of these disagree.

Commit with `chore(tooling): release v0.2.1`.

## 2. Tag and push

```bash
git tag v0.2.1
git push origin main v0.2.1
```

Create the GitHub release from the tag with `gh release create v0.2.1 --generate-notes`, then edit
the notes so the first line says what changes for a repository that updates.

## 3. Optional: publish to GitHub Packages

Only if the maintainer has asked for it. Trigger the `Publish packages` workflow by hand from the
Actions tab, choosing the tag. It publishes every `packages/*` to `npm.pkg.github.com` under the
`@lvbt` scope. Installing from GitHub Packages requires every contributor to hold a token, which is
why the git-tag path above is the default.

## 4. Update the repositories

Renovate opens one grouped pull request titled "LVBT repository standard" in each repository. Review
it, run `pnpm check`, and merge.
