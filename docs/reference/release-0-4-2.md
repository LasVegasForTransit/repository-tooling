# Repository tooling 0.4.2

A repository's checks no longer fail on another session's agent worktree. Claude Code creates each
agent worktree, a full checkout of the same repository on another branch, under `.claude/worktrees/`
inside the checkout. The examples already kept that folder out of Prettier, ESLint, and
markdownlint, but a repository set up before them never got the rules. In Labs, markdownlint linted
a worktree's Markdown and the pre-push check failed on errors that weren't part of Labs' tree.

`pnpm standards:update` now adds `.claude/worktrees` to the repository's root `.gitignore`,
`.prettierignore`, and `.markdownlint-cli2.jsonc` `ignores` wherever it's missing, and lists each
file it changes under `consumerChanged`. It keeps every existing line, comment, and entry; the
markdownlint entry goes first in `ignores`, with a comment saying why. The examples' `.gitignore`
carries the same rule. ESLint needs no change, because the shared configuration already ignores the
folder.

The updater's legacy package-scope rewrite now stops at nested checkouts too. Before, running
`pnpm standards:update` in a checkout with agent worktrees rewrote `@lvbt/*` references inside them,
editing another session's branch.
