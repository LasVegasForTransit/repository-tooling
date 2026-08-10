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

Run the complete local check with:

```bash
npm run check
```

TransitMapper is the reference consumer. Repository-specific rules may add to
the organization standard, but weakening it requires a documented exception in
[`standards/repositories.json`](standards/repositories.json).
