# Publish a tooling release

This guide cuts a release of the standard so repositories can move to it. A release is a git tag;
consumers install the packages from that tag and `create-turbo` copies the examples from it, so
nothing has to be published to a registry. Publishing to GitHub Packages is optional, manual, and
only ever done with the maintainer's explicit approval.

## Before you start

- The change is merged to `main` and CI is green.
- The standard passes its consumer validation in every repository that it affects.
- The version still names the latest published release. Development commits do not advance it and do
  not receive sequential prerelease tags.

## 1. Set one version everywhere

Choose the new version from the published contract. A backward-compatible fix increments the patch
number. A new backward-compatible consumer capability increments the minor number. A breaking change
before 1.0 increments the minor number and includes an explicit migration path.

In the release commit, set the root `package.json`, every `packages/*/package.json`, both plugin
manifests under `packages/cli/plugins/lvbt-contributions/`, and `.claude-plugin/marketplace.json` to
the same version. Pin the examples' `@lvbt/*` dependencies and Claude marketplace ref to the tag
`v<version>`. `pnpm check` fails when any of these disagree.

Commit with `chore(tooling): release v0.2.1`.

## 2. Tag and push

```bash
git tag v0.2.1
git push origin main v0.2.1
```

Create the GitHub release from the tag with `gh release create v0.2.1 --generate-notes`, then edit
the notes so the first line says what changes for a repository that updates.

Publishing the release runs the `Publish template` workflow, which copies each example at that tag
into its template repository (`examples/basic` into
[LasVegasForTransit/template-basic](https://github.com/LasVegasForTransit/template-basic),
`examples/with-astro` into `template-with-astro`, `examples/with-vite-react` into
`template-with-vite-react`), the repositories behind GitHub's "Use this template" button. It needs,
once: those repositories created and marked as templates in their settings, and a
`TEMPLATE_PUBLISH_TOKEN` secret here with write access to them. The workflow can also be run by hand
from the Actions tab with a tag.

## 3. Optional: publish to GitHub Packages

Only if the maintainer has asked for it. Trigger the `Publish packages` workflow by hand from the
Actions tab, choosing the tag. It publishes every `packages/*` to `npm.pkg.github.com` under the
`@lvbt` scope. Installing from GitHub Packages requires every contributor to hold a token, which is
why the git-tag path above is the default.

## 4. Update the repositories

Renovate opens one grouped pull request titled "LVBT repository standard" in each repository. Review
it, run `pnpm check`, and merge.
