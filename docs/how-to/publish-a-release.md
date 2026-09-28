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
the notes so the first line says what changes for a repository that updates. The release notes page
`docs/reference/release-<version>.md` belongs in the release commit; `pnpm check` fails without it.

Nothing else is needed to roll the release out. Every repository runs its own `Standard update`
workflow each day. When it finds a release newer than the one in `.lvbt/web-platform.json`, it opens
one pull request on the branch `automation/repository-standard-<tag>`, using only that workflow's
own token:

- A template repository is regenerated from its example (`examples/basic` for
  [LasVegasForTransit/template-basic](https://github.com/LasVegasForTransit/template-basic),
  `examples/with-astro` for `template-with-astro`, and `examples/with-vite-react` for
  `template-with-vite-react`). These power GitHub's "Use this template" button.
- Every other repository runs the release's own updater, so the release's migrations apply in one
  pass however old the repository's current release is.

Each pull request merges itself once `Validate` passes; approving the release is the review. A newer
release closes the older pull requests it replaces, and an update branch that fell behind `main` is
rebuilt, unless someone pushed a fix to it. To roll a release out sooner, run `Standard update` by
hand in each repository's Actions tab.

A workflow's own token may not change workflow files. When a release changes one, such as an
example's `ci.yml`, the update still opens its pull request without that file, and the run fails and
names the file to copy by hand.

## 3. Publish to GitHub Packages

Trigger the `Publish packages` workflow with the release tag. It publishes every `packages/*` to
`npm.pkg.github.com` under the `@lasvegasfortransit` scope. Contributors authenticate their local
pnpm configuration to GitHub Packages; CI uses its repository token.

## 4. Watch the repositories update

The `Standard status` workflow runs daily. Its job summary lists each repository's release and open
update pull request, and it fails when a repository has drifted: behind the latest release for more
than three days, an unreleased vendored commit on `main`, a failing update pull request, a
contribution plugin ref that differs from the vendored release, a missing `org-standard` ruleset, or
no way to update itself (no `standard-update.yml`, or a `ci.yml` without `workflow_dispatch`). Run
the same check locally with `pnpm standards:status`.

A failing update pull request means the repository needs a change the updater could not make. Fix it
on the update branch; the pull request then merges itself. A repository that must diverge from one
rule for a while records an exception in `standards/repositories.json` with the rule, a reason, and
an expiry date.

Do not cut a release to unblock one repository. Try an unreleased change there with
`pnpm standards:update --commit <sha>` on a branch that is never merged; `Standard status` flags
`release: null` on `main`.
