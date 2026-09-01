# Why the tooling is vendored and pinned

Every LVBT repository carries a copy of the shared contribution tooling instead of downloading it
at run time. This page explains that choice and what it costs.

## One release, verified offline

A checkout must validate without network access: a volunteer on a laptop, a CI runner with a
cached install, and an agent in a sandbox all run the same `pnpm check`. Vendoring the files and
recording their digest in the pin means `check` only reads the working tree. There is no
registry to be down, no floating version to resolve differently on two machines, and no way for
the plugin a hook runs to differ from the plugin the pin names.

## The check lives with what it checks

Before v0.2.0 each repository kept its own `scripts/check-repository-tooling.ts`. Two copies
existed, they had already diverged, and a third repository had never adopted the tooling because
copying the files by hand was the only path. The CLI is now a managed file itself, so a
repository's check is the one that shipped with the release it pinned, and adopting the tooling
is one command.

## Managed, scaffolded, patched

Three kinds of file follow three rules. Managed files are identical everywhere and fail `check`
when edited, because a local edit to a shared rule is a fork nobody reviews. Scaffolded files are
starting points a repository grows; the tooling writes them once and inspects only what the
organization requires of them, such as a `Validate` job. Patched files, `package.json` and
`.claude/settings.json`, hold both repository and tooling state, so the tooling edits its own
keys and leaves the rest alone.

A repository that needs more than the shared rule extends it rather than editing it. The commit
hook runs `.lvbt/hooks/commit-msg` after the shared check, so the shared floor cannot be lowered
and the repository's ceiling can be anything.

## What this costs

Every update is a pull request per repository. That is deliberate: a tooling change is reviewed
where it lands, in a diff that contains only managed paths. The price is that a release does not
propagate itself; [Publish a tooling release](../how-to/publish-a-release.md) ends with updating
each consumer, and until consumers automate that step it is a maintainer's checklist.
