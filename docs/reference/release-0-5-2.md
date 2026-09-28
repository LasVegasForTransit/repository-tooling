# Repository tooling 0.5.2

Nothing changes in how your repository works. This patch makes the `Standard update` workflow finish
its job on its own.

- The update commits and pushes with the repository's git hooks switched off. Installing
  dependencies turns those hooks on, so before this the push ran the full pre-push check, end-to-end
  tests included, and a template's regenerated tree left a hook pointing at deleted files.
- GitHub holds the workflow runs of a pull request that a workflow's own token opened until someone
  approves them. The update now approves the runs it started, so `Validate` runs and a patch update
  merges itself. If the token may not approve them, the run fails after opening the pull request and
  says so; a maintainer approves the runs on the pull request.
- `ci.yml` no longer needs a `workflow_dispatch` trigger for updates.

A repository on 0.5.0 or 0.5.1 whose own update failed for either reason needs this release applied
once by a maintainer with `standards/propose.ts`; after that it updates itself.
