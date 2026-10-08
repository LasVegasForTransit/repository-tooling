# Migrate the LVBT process contract to 0.7

This checklist records read-only GitHub inventory on 2026-10-07. Each repository was read at one
observed default-branch commit, including package scripts, the generated snapshot manifest, hooks,
shared configuration entrypoints, and audit/release workflows. The newest published release was
v0.6.3; prepared local migration branches are not evidence of adoption on main.

## Observed repositories

| Repository and observed source                                                                                                             | Branch / exact commit                             | Adopted release     | Required migration                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [.github](https://github.com/LasVegasForTransit/.github/commit/64832c759df0d1e84766c01d4a339a9e638f392c)                                   | main / `64832c759df0d1e84766c01d4a339a9e638f392c` | v0.5.4              | Update the shared snapshot and hook copies; move community-health checks into Turbo validate; declare dependency audits.                             |
| [analytics](https://github.com/LasVegasForTransit/analytics/commit/e8ec77a5542cd20742eb5bac7e3f3532cf2733d7)                               | main / `e8ec77a5542cd20742eb5bac7e3f3532cf2733d7` | v0.6.3              | Preserve Worker-pool and browser checks through shared config extensions; declare audits and collector staging/promotion with isolated bindings.     |
| [labs](https://github.com/LasVegasForTransit/labs/commit/6ca6beccc960e1860b0f4a026089811787999f82)                                         | main / `6ca6beccc960e1860b0f4a026089811787999f82` | unreleased snapshot | Replace the unreleased snapshot with the reviewed tag; preserve Labs product commands; declare per-app release profiles and dependency audits.       |
| [repository-tooling](https://github.com/LasVegasForTransit/repository-tooling/commit/2bd5cf25df37c26ee93ced7ae1c2cb19fdaf0010)             | main / `2bd5cf25df37c26ee93ced7ae1c2cb19fdaf0010` | v0.6.3              | Complete source validation, tag and publish 0.7.0, then regenerate snapshots and workflow pins. Source command exemptions remain explicit.           |
| [template-basic](https://github.com/LasVegasForTransit/template-basic/commit/d0bf8842210e77385f3b3d6079ce99a022da64d2)                     | main / `d0bf8842210e77385f3b3d6079ce99a022da64d2` | v0.5.4              | Regenerate from the basic example; adopt guarded setup and shared audits; retain the package product validator.                                      |
| [template-with-astro](https://github.com/LasVegasForTransit/template-with-astro/commit/228879031d249dc46ad0567c0ed15c968fa99d16)           | main / `228879031d249dc46ad0567c0ed15c968fa99d16` | v0.5.4              | Regenerate the Astro template with guarded setup, shared configs, audits, retained staging, and explicit promotion.                                  |
| [template-with-vite-react](https://github.com/LasVegasForTransit/template-with-vite-react/commit/dfa6dbb26ed77a2be825fc4744e66a06bd37d41c) | main / `dfa6dbb26ed77a2be825fc4744e66a06bd37d41c` | v0.5.4              | Regenerate the Vite template with guarded setup, shared configs, audits, retained staging, and explicit promotion.                                   |
| [transit-mapper](https://github.com/LasVegasForTransit/transit-mapper/commit/6a85c58567d9d5b8abf95850c95e8d58facd937b)                     | main / `6a85c58567d9d5b8abf95850c95e8d58facd937b` | unreleased snapshot | Replace bespoke setup/governance with shared declarations; preserve preview D1, product validators, SQL migrations, and additional queue protection. |
| [website](https://github.com/LasVegasForTransit/website/commit/eacbc6b17c4434a66be087f52172fa6ae4101ebc)                                   | main / `eacbc6b17c4434a66be087f52172fa6ae4101ebc` | v0.6.3              | Replace app bootstrap with shared setup; preserve all platform requirements, Notion env consumers, audits, and retained release compatibility.       |
| [week-without-driving](https://github.com/LasVegasForTransit/week-without-driving/commit/435805370ce6ea8a04279b9f1e0b5c100b765a1b)         | main / `435805370ce6ea8a04279b9f1e0b5c100b765a1b` | v0.6.3              | Adopt guarded setup and shared audits; declare retained releases and SQL migrations while preserving platform and product acceptance.                |

All ten observed repositories have the org-standard ruleset. Consumer/template repositories have the
Standard update workflow; the source repository publishes that workflow instead of adopting it.
Release-lag and update-status errors remain errors. New process diagnostics warn in 0.7.x; command
enforcement begins in 0.8.0. Shared-config warnings establish direct org imports or relative config
inheritance only: inspect workspace wrappers before replacing valid product extensions.

The existing status errors were release lag in .github and all three templates, unreleased snapshots
in Labs and TransitMapper, and failing update Validate checks in .github PR #15, Labs PR #47, and
TransitMapper PR #175. These observations are point-in-time evidence; rerun inventory before merging
an update.

## Complete each consumer migration

- [ ] Install the tagged standard through the updater; do not edit generated vendor files. Confirm
      the recorded commit/content hash and contribution-plugin ref agree with the reviewed release.
- [ ] Set root bootstrap/preflight to the direct Node entrypoints emitted by the updater. Set
      verifyDepsBeforeRun: false in pnpm-workspace.yaml; preserve registry/auth entries and the
      existing package-import-method configuration. Prove preflight works without node_modules and
      changes no checkout files, and that bootstrap validates the toolchain before installing.
- [ ] Declare environment examples and optional integrations in .lvbt/tooling.json. Preserve
      existing local values; require publishing credentials only for explicit production operations.
- [ ] Adopt the canonical root check/audit commands and shared hook copies. Move application checks
      into Turbo validate while preserving ordering, runtime coverage, and product budgets.
- [ ] Extend shared lint, format, TypeScript, unit-test, and browser-test configurations. Retain
      application plugins, Worker test pools, and browser acceptance through supported extensions.
- [ ] Declare local and production audit adapters. Use a default-branch scheduled/manual workflow
      and the shared issue reporter; prove failed/incomplete evidence cannot close audit-owned
      issues.
- [ ] For deployed apps, declare staging and explicit promotion profiles. Retain compiled bytes, SQL
      migrations, binding scopes, source identity, and hashes; run product acceptance against the
      saved candidate. Keep staging data isolated and production promotion explicit.
- [ ] Verify a clean install, pnpm check, pnpm build, and application acceptance. Confirm protected
      staging independently before promoting the exact retained artifact. Keep legacy recovery
      commands until the replacement has provider-backed acceptance.
- [ ] Update clone/bootstrap/dev/check/PR/staging/promotion documentation. Rerun pnpm
      standards:status --json and record the newly observed main commit after merge.

## Rollout boundaries

The source repository uses its own source entrypoints and validation graph; consumer Turbo
requirements do not apply to it. An undeployed basic package has no release profile requirement.
Existing production credentials, retained data, domains, and governance protections are migration
inputs, not permission to create or rotate credentials or change provider configuration. A shared
snapshot update alone does not migrate application-owned workflows and declarations.
