# LVBT agent resource policy

Policy version: 1. This is the canonical policy for every LVBT project. Distribute it through the
repository standard; do not maintain project-specific copies or relax it in local instructions.
Repository-specific guidance continues to apply alongside this policy.

## Preflight

- Default to local or mocked tests. Inspect existing instructions, compatible installed
  dependencies, caches and focused checks before downloading packages, creating worktrees or device
  images, or running a build matrix. Reuse compatible dependencies and avoid duplicate agent work.
- Before touching a shared service, name the environment, account and resources; the operation and
  expected request, row-read, write, storage and runtime costs; a finite budget; and the owner of
  cleanup. Check available quota and preserve headroom for production, backups and critical alerts.
  Set both per-project and shared-account budgets. Preview and staging share account limits and are
  not free or safe by default. Distinguish rows read from rows stored and daily quotas from rolling
  observation windows; verify current provider limits before citing numeric allowances.
- Inspect query plans, indexes and realistic cardinality locally before live database queries. Bound
  pages, rows scanned, requests and elapsed time; a small result limit alone does not bound reads.
  Use pagination, and batch only when the query plan and total cost make it safe. Never issue
  unbounded shared-service queries or full-table polling when a queue is idle.
- Cloud or live acceptance requires a defined target, finite scope, cost ceiling, concurrency,
  timeouts, retry limit, stop conditions and safe teardown before execution. Use the smallest
  representative sample. Establish which schedules and background consumers it activates. Keep seed
  data explicitly bounded by record count and size. Add resource acceptance tests for idle paths and
  representative query costs using local data before live acceptance.

## Execute and stop

- Bound concurrency, retries and timeouts explicitly. Use backoff for transient failures. Stop the
  affected workload on quota or rate-limit errors until the cause and a safe budget are understood;
  do not blindly retry, rerun CI, or move the same load to another shared environment.
- Do not create uncontrolled cron jobs, synthetic traffic or idle polling. Keep preview background
  jobs off unless needed for the defined test, and explicitly review cron or periodic polling before
  deployment. Scheduled work needs a documented cadence, per-run and daily budget, an idle path that
  avoids scans, and an owner who can stop it. Preview activity must protect production and backup
  resource budgets.
- Stop when actual cost exceeds the budget, the environment is ambiguous, cleanup is unsafe, or
  unexpected production impact appears. Preserve evidence and report the smallest actionable
  blocker. Do not automatically buy upgrades, increase paid limits, broaden credentials, permissions
  or security access. Those changes require separate explicit user authorization.
- Cancel superseded CI runs when safe. Avoid duplicate push and pull-request work where required
  gates permit; bound matrices and job concurrency. Reuse valid caches, preserve cache isolation and
  integrity, and set bounded artifact/cache retention without deleting required recovery evidence.
- Keep critical alerts enabled. Never weaken tests, suppress meaningful failures, or disable alerts
  to make a run appear healthy. A backup HTTP error alone does not prove quota exhaustion;
  distinguish observed failures from causal hypotheses.

## Verify and report

- Own the change and its CI through green. Inspect a failure, address its cause and run the focused
  check before retrying. Escalate actionable blockers with evidence and the precise decision needed;
  avoid blind rerun loops or open-ended status polling.
- A merged resource fix is not proof of operational recovery. For a deployed resource fix, verify
  the deployed version and required migration state, then compare observed requests and rows read
  including post-deploy idle cost against the stated budget in a bounded observation window. Until
  authorized deployment and observations exist, report the fix as merged or tested with operational
  verification still pending.
- Report the policy/standard version, environments touched, checks and CI results, measured resource
  use (or what remains unknown), stop events, cleanup performed and remaining blockers. Do not claim
  every project is covered until the active repository inventory and adopted policy text reconcile.
- Stop temporary processes and remove owned, regenerable outputs after completion. Verify ownership
  and reproducibility first; preserve dirty files, unmerged work, useful evidence and other agents'
  outputs. Never trade resource savings for lost work or weakened recovery.
