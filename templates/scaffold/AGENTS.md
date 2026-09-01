# Working in this repository

Run `pnpm check` after every change. It is the same command CI runs, and a
failing check names the command that fixes it.

## Create GitHub issues and pull requests

Use the mandatory `github-contribution` skill from the pinned
`lvbt-contributions` plugin whenever a user authorizes creating an issue or
pull request. It carries the organization checklist, readable templates, and
the only approved creation helper:

```bash
node plugins/lvbt-contributions/scripts/github-create.mjs issue \
  --type bug|feature --title <title> --body-file <file>
node plugins/lvbt-contributions/scripts/github-create.mjs pr \
  --title <title> --body-file <file> --base main
```

Preview with `--dry-run --json` and inspect the complete Markdown before
creating anything. Do not call `gh issue create`, `gh pr create`, equivalent
`gh api` routes, or connector creation tools directly.

## Commit messages

Subjects are conventional: `type(scope): description`, at most 72 characters.
Scopes are optional and come only from [`.lvbt/commit-scopes.txt`](.lvbt/commit-scopes.txt).
Omit the scope when a change crosses boundaries; never invent one for a
feature, file, task, or role.

## Organization tooling

The files under `plugins/lvbt-contributions/`, `.lvbt/repository-tooling/`,
the managed hooks in `.githooks/`, and the harness wiring in `.agents/`,
`.codex/`, and `.github/actions/setup-node-pnpm/` are vendored from
`LasVegasForTransit/repository-tooling` and verified by
`pnpm check:repository-tooling`. Change them there, then run
`pnpm repository-tooling:update --release <tag>` here.
