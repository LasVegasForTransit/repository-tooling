# Repository tooling 0.4.4

`pnpm standards:update` now leaves a repository untouched when it can't read one of its files. It
works out every change to the repository's own files before writing any of them, so a
`.markdownlint-cli2.jsonc` it can't read stops the update with nothing changed. Before, earlier
changes were already written while the vendored standard stayed on the old version.

The ignore rules from 0.4.2 are also more careful. A rule already written another way that covers
the same paths, such as `.claude/worktrees/**` or `/.claude/worktrees/`, counts as present instead
of getting a duplicate. Added lines keep the file's line endings. A YAML or JavaScript markdownlint
configuration isn't edited; the update prints a warning naming the rule to add. The package-scope
rewrite now skips `.claude/worktrees/` by path, so a worktree folder whose checkout is gone stays
untouched.

The Astro rule from 0.4.1 now applies only to Astro projects: packages that depend on `astro` and
have their own `astro.config.*`. A library that only imports Astro's types, such as an integration
or a component package, no longer needs a `sync` script, and `lvbt check contract` no longer asks
for one. A repository that added `sync` to such a library can remove it after updating.
