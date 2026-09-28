# Repository tooling 0.5.1

Nothing changes in how your repository works. This patch fixes the maintainer script that gives a
repository its first `Standard update` workflow, and makes a missing `workflow_dispatch` trigger
easy to spot.

- Rerunning `standards/propose.ts` from a checkout still on the update branch no longer closes that
  branch's own pull request. An unchanged run now closes a same-release pull request only when the
  default branch on GitHub already vendors the release.
- A tracking ref left from an update branch GitHub has deleted no longer makes the next push fail.
- When `ci.yml` has no `workflow_dispatch` trigger, the `Standard update` run now says so and fails
  after opening its pull request, instead of stopping with an unexplained error.

This is a patch release, so its update pull request merges itself once `Validate` passes. It is the
first release to reach repositories through their own `Standard update` workflow.
