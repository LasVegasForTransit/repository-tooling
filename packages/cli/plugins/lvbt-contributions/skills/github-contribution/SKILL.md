---
name: github-contribution
description:
  Create or open a GitHub issue or pull request in a LasVegasForTransit repository. Use whenever an
  agent is asked to create, open, file, or publish an issue or pull request.
compatibility: Requires Node.js 24+, git, gh, and authenticated GitHub access.
---

# Create an LVBT GitHub contribution

Use the native, readable repository templates. Never construct hidden metadata or call a GitHub
creation command directly.

## Mandatory checklist

1. Confirm that the user authorized creating the issue or pull request.
2. Search the repository for an issue or open pull request covering the work.
3. Choose the bug, feature, or pull request template from this skill's `assets/`.
4. Write complete, concise repository-specific prose. The TL;DR names the outcome a person can use
   or observe; the overview explains the important behavior, constraint, or trade-off without
   becoming a file inventory. Follow-ups are optional and name unfinished product or reliability
   objectives, never chores such as rebasing, formatting, or running checks. Use `feat` in a
   pull-request title only for a capability someone can use or observe; groundwork belongs under a
   more precise conventional type. Commit scopes are optional. Read the current repository's
   `.lvbt/commit-scopes.txt` before using one; the shared helper validates that repository-owned
   list. Omit the scope rather than inventing one for a feature, file, task, or role.
5. For a pull request, confirm the branch is pushed and run the repository's required validation
   command.
6. Run the helper with `--dry-run` and inspect the complete title and body.
7. Run the same helper without `--dry-run` to create the item.
8. Return the verified URL emitted by the helper.

## Commands

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/github-create.mjs" issue \
  --type bug|feature --title <title> --body-file <file> --dry-run

node "${CLAUDE_PLUGIN_ROOT}/scripts/github-create.mjs" pr \
  --title <conventional-title> --body-file <file> --base main --dry-run
```

Add `--json` for machine-readable output. Remove `--dry-run` only after the preview is correct. Do
not replace the helper with `gh issue create`, `gh pr create`, `gh api`, or a GitHub connector.

## Verified audit automation

Scheduled and manual audit workflows on the default branch use the same helper:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/github-create.mjs" audit \
  --input lvbt-audit-report.json --dry-run --json
```

Inspect the complete actions, titles, bug headings, reproduction commands, findings, and artifact
links before removing `--dry-run`. The helper validates the GitHub run, its configured workflow, and
the downloaded report artifact before changing issues. It rejects stale runs and ambiguous
ownership. Each check and target owns one issue with the visible `audit-owned`, `audit:<check>`, and
`target:<target>` labels. Failure updates or reopens that issue; a corresponding verified passing
result closes it. Errors, skipped checks, and absent results never close an issue.

The workflow must serialize reporting with one concurrency group per repository and must upload
`lvbt-audit-report.json` to the configured audit artifact before reporting. Local execution and
untrusted pull request runs may produce reports but cannot maintain audit issues.
