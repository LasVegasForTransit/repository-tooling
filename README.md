# LVBT repository tooling

This repository is the source of truth for contribution tooling shared by
Las Vegans for Better Transit repositories.

It owns three things:

- the GitHub issue forms and pull request template published by
  [`LasVegasForTransit/.github`](https://github.com/LasVegasForTransit/.github);
- the `lvbt-contributions` Agent Skill, creation helper, and harness hooks;
- the default-branch ruleset applied to every active organization repository.

The tooling guides people with native GitHub forms and readable Markdown.
Agent-only guardrails prevent an agent from bypassing those same templates;
they do not add hidden metadata or GitHub-side prose validation.

Pull requests lead with the outcome for a person using the product, then
explain the material behavior or trade-off in complete prose. Follow-ups name
unfinished product or reliability objectives rather than repository chores.
Conventional `feat` titles are reserved for capabilities people can use or
observe; internal groundwork uses a more precise type.

Commit scopes are optional. The complete organization list is `web`, `worker`,
`core`, `pwa`, `dx`, `tooling`, and `ci`. Each names a durable repository
boundary. A cross-boundary change omits its scope; a feature name, file name,
task name, or contributor role is never a scope.

Run the complete local check with:

```bash
pnpm check
```

TransitMapper is the reference consumer. Repository-specific rules may add to
the organization standard, but weakening it requires a documented exception in
[`standards/repositories.json`](standards/repositories.json).
