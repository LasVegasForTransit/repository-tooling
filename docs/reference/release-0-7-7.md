# Repository tooling 0.7.7

Contributors run `pnpm bootstrap` to enable the shared Git hooks before tool checks or dependency
installation. A failed install now leaves the hooks enabled, so commits and pushes fail when their
required tools are missing instead of skipping local validation.

`pnpm preflight` checks the effective Git hooks path. It reports worktree overrides that disable the
hooks even when the repository's local configuration names `.githooks`. Bootstrap refuses to install
dependencies while such an override remains and names the command that shows its source.

All shared package and example references advance to 0.7.7. Maintainers can adopt the reviewed
source commit with the standard updater. Tagging, publication, and consumer updates remain pending.
