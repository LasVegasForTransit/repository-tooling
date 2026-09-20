# Publish a tooling release

This guide cuts a release of the standard so repositories can move to it. A release tag identifies
the matching source and vendored preset. The shared packages publish to GitHub Packages under the
`@lasvegasfortransit` scope. Published templates vendor the same release, so their standard stays
available locally and validation remains network-free.

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
the same version. Pin the examples' `@lasvegasfortransit/*` dependencies and Claude marketplace ref
to the tag `v<version>`. `pnpm check` fails when any of these disagree.

Commit with `chore(tooling): release v0.3.0`.

## 2. Tag and push

```bash
git tag v0.3.0
git push origin main v0.3.0
```

Create the GitHub release from the tag with `gh release create v0.3.0 --generate-notes`, then edit
the notes so the first line says what changes for a repository that updates.

Publishing the release runs the `Publish template` workflow, which prepares each example at that tag
in a protected template repository (`examples/basic` for
[LasVegasForTransit/template-basic](https://github.com/LasVegasForTransit/template-basic),
`examples/with-astro` for `template-with-astro`, and `examples/with-vite-react` for
`template-with-vite-react`). Each generated update uses a release-specific branch and pull request;
the organization ruleset still guards `main`. Merge those reviews after their `Validate` checks
pass. These repositories power GitHub's "Use this template" button.

The workflow requires the repositories to be marked as templates and a `TEMPLATE_PUBLISH_TOKEN`
secret with contents and pull-request write access to all three. Manual dispatch accepts stable
release tags only; development commits and prerelease tags do not publish templates.

## 3. Publish to GitHub Packages

Trigger the `Publish packages` workflow with the release tag. It publishes every `packages/*` to
`npm.pkg.github.com` under the `@lasvegasfortransit` scope. Contributors authenticate their local
pnpm configuration to GitHub Packages; CI uses its repository token.

## 4. Update the repositories

Renovate opens one grouped pull request titled "LVBT repository standard" in each repository. Review
it, run `pnpm check`, and merge.
