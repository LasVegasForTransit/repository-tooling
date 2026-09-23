# Repository tooling 0.3.5

`pnpm standards:update` now applies a release with the updater that release carries. The changes a
release makes to a repository's own files, such as the `.gitignore` rules from 0.3.4, happen in the
same update that installs it. Before, the updater already vendored in the repository did the work,
so a release's new changes arrived one update late.

The update that installs 0.3.5 still runs the older updater. A repository on 0.3.4 needs nothing
more. A repository updating from 0.3.3 or earlier should run the update command a second time so
that the 0.3.4 `.gitignore` rules are added.
