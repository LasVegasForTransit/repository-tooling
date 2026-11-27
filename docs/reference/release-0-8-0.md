# Repository tooling 0.8.0

Organization repositories standardize on GitHub rebase merge queues. `standards/ruleset.json` now
includes the `merge_queue` rule (`REBASE`, `ALLGREEN`), while governance, doctor, and
ruleset-provisioning helpers omit `merge_queue` when checking or configuring personal-account
repositories.

Example `.github/workflows/ci.yml` workflows now trigger on `merge_group` and guard
`cancel-in-progress` with `github.event_name != 'merge_group'` so queued entries always report
`Validate` and are never cancelled when GitHub re-forms a merge group. Repositories adopting `0.8.0`
should copy the `merge_group` trigger and concurrency expression into `.github/workflows/ci.yml`
before enabling `merge_queue` on `main`.

This release also includes separated Worker-version readiness checks during uploads, skips unused
Git LFS downloads in release builds, and resumes named promotion across workflow attempts. All
shared package versions, example dependency pins, and contribution plugin references advance to
`0.8.0`.
