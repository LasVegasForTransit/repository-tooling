# LVBT repository tooling

This repository is the source of truth for contribution tooling shared by
Las Vegans for Better Transit repositories.

It owns four things:

- the GitHub issue forms and pull request template published by
  [`LasVegasForTransit/.github`](https://github.com/LasVegasForTransit/.github);
- the `lvbt-contributions` Agent Skill, creation helper, and harness hooks;
- the default-branch ruleset applied to every active organization repository;
- the lifecycle CLI that vendors all of the above into a repository, updates
  it, and proves nothing drifted.

The tooling guides people with native GitHub forms and readable Markdown.
Agent-only guardrails prevent an agent from bypassing those same templates;
they do not add hidden metadata or GitHub-side prose validation.

## Adopt it in a repository

One command vendors the plugin, the managed git hooks, the harness wiring for
Claude Code and Codex, and the CI setup action, then scaffolds the files a
repository needs to pass the check:

```bash
npx --yes github:LasVegasForTransit/repository-tooling#v0.2.0 init --scopes web,worker,docs,ci,dx
pnpm install
pnpm check:repository-tooling
```

Later releases are one command too:

```bash
pnpm repository-tooling:update --release <tag>
```

The step-by-step guides, the command reference, and the list of managed
files are in [`docs/`](docs/README.md).

## Contribution rules the tooling enforces

Pull requests lead with the outcome for a person using the product, then
explain the material behavior or trade-off in complete prose. Follow-ups name
unfinished product or reliability objectives rather than repository chores.
Conventional `feat` titles are reserved for capabilities people can use or
observe; internal groundwork uses a more precise type.

Commit scopes are optional and repository-owned. Every consumer declares its
durable boundaries in [`.lvbt/commit-scopes.txt`](.lvbt/commit-scopes.txt); the
shared validator reads that file for both commit hooks and pull-request titles.
A cross-boundary change omits its scope; a feature name, file name, task name,
or contributor role is never a scope.

## Working on this repository

Run the complete local check with:

```bash
pnpm check
```

It runs every test under `tests/`, including an end-to-end run of `init`,
`update`, and `check` against temporary repositories. Managed files live under
`templates/managed/`, scaffolds under `templates/scaffold/`, and the CLI under
`bin/`. This repository consumes its own managed hooks, and a test fails if
they drift from the templates.

TransitMapper is the reference consumer. Repository scopes are complete local
policy: the shared tooling supplies the subject grammar and enforcement path,
not an organization-wide domain vocabulary. A repository that needs to weaken
another shared contribution rule requires a documented exception in
[`standards/repositories.json`](standards/repositories.json).
