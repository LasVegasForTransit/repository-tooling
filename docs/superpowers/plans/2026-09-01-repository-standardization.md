# LVBT repository standardization plan (mass-volunteer readiness)

## Status (2026-09-02)

Phase 0 is on pull request #11 (`feat/turborepo-standard`), CI green, awaiting merge; after the
merge, tag `v0.2.0` and publish the release so the template repositories fill. Done on GitHub:
`template-basic`, `template-with-astro`, `template-with-vite-react` exist and are marked as
templates; the `maintainers` team exists with maintain access on the three active repositories; the
label taxonomy is applied. Still needed from a person: the `TEMPLATE_PUBLISH_TOKEN` secret, the
Renovate GitHub app installation (not installed on the organization), and the pull request merge.
Phase 2: `labs` is converged locally (two commits on `main`, `link:` specifiers, check and browser
suites green) and is not pushed; the standalone `transit-funding` repository is an older copy of
`labs/apps/transit-funding` and was not pushed pending a decision. `analytics` is resynced and not
pushed. Next: switch `link:` to the `v0.2.0` tag once it exists, push `labs` and `analytics`, then
converge `transit-mapper` and `website`.

## Context

LVBT is preparing for many volunteer contributors across its repositories. Today the three active
web repositories were built at different times by different hands and disagree on nearly every axis
a newcomer touches: how to install, which command checks the work, where tests live, what a commit
message must look like, how docs are organized, and how code ships. A volunteer who learns one repo
learns nothing transferable to the next, and maintainers carry three copies of the same tooling. The
user's standing directive is to standardize aggressively, with no one-off fixes: shared behavior
lives in shared packages, and every repository is a conventional Turborepo workspace.

The standard itself was built earlier today in `repository-tooling` (branch
`feat/turborepo-standard`, local, unpushed): `@lvbt/eslint-config`, `@lvbt/typescript-config`,
`@lvbt/prettier-config`, `@lvbt/vitest-config`, `@lvbt/cli` (bin `lvbt`: `bootstrap`, `preflight`,
`deploy`, git hooks, contribution plugin, version catalog), and a runnable `examples/package`
workspace that a GitHub template repository will mirror. This plan (1) closes the gaps the audit
exposed in that standard, (2) converges labs, transit-mapper, and website onto it, and (3) adds the
org-level and onboarding layers volunteers need. Analytics, planned earlier today, is a small final
section.

Decisions made by the user on 2026-09-01: full convergence for the website (workspace shape and
Cloudflare Workers); transit-mapper's ESLint level becomes the org baseline; docs use domain-first
Diátaxis.

## Audit: where the three repos disagree

Repos: `website/` (Astro, Cloudflare Pages), `labs/` (Astro home + Vite lab, Workers, zero commits
yet), `transit-mapper/` (Vite/React + Hono Worker + D1). Full findings are in this session's audit
output; the table shows the axes that matter for standardization.

| Axis               | website                                                                  | labs                                                         | transit-mapper                                                     |
| ------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| pnpm / Node pin    | 11.9.0 / `^24.18.0` + `.nvmrc`; CI action defaults to **Node 22**        | 11.24.0 / exact `24.18.0` in 3 files                         | 11.15.1 / `>=24`; no version file                                  |
| Workspace          | single package with a `pnpm-workspace.yaml` of `['.']`; no Turbo         | Turbo workspace, `tooling` dir, exact-pin catalog            | Turbo workspace, 46-entry caret catalog                            |
| `check`            | none (`lint` means prettier --write)                                     | sequential `tooling/src/check.ts`                            | `turbo run validate` graph                                         |
| Test entry         | `test` = Playwright only; one `node:test` file never runs                | `test` + `test:e2e`; packages alias `test:e2e` to unit tests | `verify` (no `test`); no Playwright at all                         |
| ESLint             | **none**                                                                 | recommendedTypeChecked + 3 rules                             | strictTypeChecked + shape caps + Sonar + suppression ledgers       |
| Prettier           | `.prettierrc.json`, no proseWrap                                         | `prettier.config.ts`, proseWrap always                       | `prettier.config.mjs`, no proseWrap                                |
| TypeScript base    | `astro/tsconfigs/strict` only                                            | strict base; home app bypasses it                            | `@transitmapper/tsconfig`; `noUncheckedIndexedAccess` only at root |
| Hooks              | custom 6-step pre-push, body-rule commit validator, `allowed-scopes.txt` | **none**                                                     | 4 hooks incl. agent trailer; free-form scopes                      |
| Secret scanning    | none                                                                     | none (docs claim it)                                         | gitleaks pre-commit + CI                                           |
| repository-tooling | v0.1.0 vendored plugin + pin                                             | none                                                         | none                                                               |
| CI Validate job    | yes + 5 more workflows                                                   | yes (only workflow)                                          | yes + release-please deploy + perf                                 |
| Renovate           | yes, patch automerge                                                     | none                                                         | yes, typescript disabled                                           |
| Deploy             | Pages from Actions                                                       | **no deploy workflow**; docs describe five                   | Workers, attested release, smoke tests                             |
| Docs layout        | flat Diátaxis + `standards/`                                             | domain-first Diátaxis                                        | domain-first Diátaxis, no glossary                                 |
| Community files    | none locally (org inherits)                                              | all present                                                  | all present; local PR/issue templates shadow org                   |

Per-repo defects the audit found that are simply wrong today (fixed in Phase 2):

- website: CI runs Node 22 while the repo requires 24; bootstrap pins pnpm 10.33; docs say Astro 4
  and 5; `tests/membership-intake.test.ts` never executes; visual-regression and content-lint jobs
  soft-fail permanently; `lychee-action` unpinned; three copies of the beehiiv MCP config; Turborepo
  residue in ignore files; ~25 stray PNGs in the working tree.
- labs: README advertises `create`, `deprecate`, `retire`, `migrate`, `doctor`, `provision`,
  `standards:update`, `status`, `rollback` that throw or do not exist; two e2e suites contradict
  each other; `apps/home` pins `vite 7.3.6` outside the catalog; `@lvbt/ui` unused; robots policy
  conflicts with the manifest; `check:manifests` orphaned; no hooks, no Renovate, no CODEOWNERS, no
  commits.
- transit-mapper: `minimumReleaseAgeExclude` without `minimumReleaseAge`; committed `apps/web/.env`
  vars nothing reads; workflow comments link a doc path that does not exist; `lint:fix` contradicts
  the repo's own suppression model; `.spec`/`tests/e2e` rule enforced with nothing using it;
  CODEOWNERS names a team that does not exist.

## The target standard

Everything below is what `examples/basic` in `repository-tooling` expresses, and what every repo
converges to. Where the standard does not yet say it, Phase 0 adds it.

- **One shape.** A Turborepo workspace: `apps/*`, `packages/*`, root `package.json`,
  `pnpm-workspace.yaml` with the org catalog, `turbo.json`. Repository-specific tooling scripts live
  under `scripts/` with their own tsconfig.
- **One toolchain source.** `packageManager: pnpm@11.24.0` and `engines.node: ">=24.18.0"` in the
  root `package.json`; the CI action uses `node-version-file: package.json`; `lvbt preflight` checks
  both. No `.nvmrc`/`.node-version` duplicates.
- **One script vocabulary.** Root: `bootstrap`, `preflight`, `dev`, `build`, `preview`, `lint`,
  `lint:fix`, `check-types`, `test`, `test:e2e`, `format`, `format:check`, `check`, `check:fix`,
  `deploy` (deployable repos), `prepare`. Packages: `lint`, `check-types`, `test`, and `build` where
  they build. `check` = `pnpm format:check && turbo run lint check-types test`.
- **One lint level.** `@lvbt/eslint-config/base` = `@eslint/js` recommended, typescript-eslint
  `strictTypeChecked` + `stylisticTypeChecked`, suppression hygiene
  (`reportUnusedDisableDirectives`, `eslint-comments` rules), shape caps (max-lines 400,
  max-lines-per-function 80, max-depth 4, max-params 4, max-nested-callbacks 3, complexity 15,
  relaxed for tests), four SonarJS rules, `turbo/no-undeclared-env-vars`, Prettier last, Node
  globals for JS. `react-internal` adds browser globals and React hooks. Suppression ledgers
  (`eslint-suppressions.json`) are allowed and may only shrink; the ratchet check moves into
  `@lvbt/cli` so all repos share it.
- **One TypeScript base.** `@lvbt/typescript-config/base.json` (strict, ES2024, bundler,
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`,
  `noUnusedLocals/Parameters`, `noImplicitReturns`) with `node`, `browser`, `worker`,
  `react-library` targets, and an `astro.json` that uses the `extends` array to combine
  `astro/tsconfigs/strict` with the base. Every package has `tsconfig.json` (wide, for the language
  service and type-aware lint) and `tsconfig.build.json` (narrow, what ships).
- **One test layout.** Vitest unit tests under `<package>/tests/**/*.test.ts(x)`, Playwright
  end-to-end under `<package>/tests/e2e/**/*.spec.ts`, test-only support under `tests/support/`.
  Sequential `verify`-style suites stay as ordinary Vitest files or `tsx` scripts invoked by `test`.
  `@lvbt/vitest-config` is spread; `@lvbt/playwright-config` is added for the site and app profiles.
- **One formatting.** `@lvbt/prettier-config` (100 columns, single quotes, trailing commas, prose
  wrapped at 100); Astro repos add the Astro plugin in their own `prettier.config.js`.
  `.editorconfig` and `.prettierignore` from the example everywhere.
- **One commit grammar.** Conventional subject ≤ 72 chars, types from the shared list, scopes from
  `.lvbt/commit-scopes.txt`, `Co-Authored-By` trailer added by `prepare-commit-msg` when an agent
  drives the commit and required by `commit-msg` when one does. Body rules (required for feat/fix,
  wrap at 72) move into the shared validator so the website's extra validator retires.
- **One hook set.** `.githooks/{pre-commit,commit-msg,prepare-commit-msg,pre-push}` stubs calling
  `@lvbt/cli`: pre-commit = lint-staged Prettier + gitleaks (warn if not installed); commit-msg =
  shared validator; pre-push = `pnpm check`. Repository-specific steps go below the shared call in
  the stub.
- **One CI shape.** `ci.yml` with the `Validate` job: setup action, `pnpm check`,
  `pnpm audit --audit-level=high`, gitleaks (pinned container). Extra workflows (audits,
  performance, release, deploy) are repo-owned and additive. All actions SHA-pinned. Renovate from
  the example config, with the `@lvbt/*` regex manager.
- **One deploy path.** Cloudflare Workers with static assets for every app; `lvbt deploy` builds and
  runs `wrangler deploy` for each `apps/*` that has a wrangler config; release-please gating and
  attestation (transit-mapper's) become the standard release workflow template in `examples/`.
- **One docs layout.** `docs/<domain>/<tutorials|how-to|reference|explanation>/` with
  `docs/README.md` index, `docs/development/reference/glossary.md`, and
  `docs/development/tutorials/start-here.md` required; `markdownlint-cli2` with the relative-links
  rule replaces the three hand-written link checkers. Design records under
  `docs/superpowers/{specs,plans}/`. Community files inherit from the org `.github` repo; no local
  PR/issue templates.
- **One agent contract.** `AGENTS.md` with the standard paragraphs (from the example) above
  repo-specific guidance, `CLAUDE.md` as a symlink to it, `.claude/settings.json` with the
  marketplace ref, the org deny-list for secret files (transit-mapper's), and the Prettier post-edit
  hook.

## Phases

Each phase is independently valuable; volunteers can start after Phase 2. One PR per repo per phase,
each passing the repo's own `pnpm check` before merge.

### Phase 0: close the gaps in `repository-tooling` (1 PR, then tag v0.2.0)

Files: `repository-tooling/packages/*`, `examples/*`, `tests/*.test.mjs`, `docs/`.

1. Rename `examples/package` to `examples/basic` and the template target to `template-basic`
   (`.github/workflows/publish-template.yml`, docs, `tests/example.test.mjs`).
2. Toolchain single source: catalog `packageManager` to `pnpm@11.24.0`; example
   `engines.node: ">=24.18.0"`; setup action switches to `node-version-file: package.json`;
   `lvbt preflight` compares against `engines.node` with a range check (already does for the major;
   extend to full semver).
3. Raise `@lvbt/eslint-config/base` to the transit-mapper level: port `packages/config-eslint`'s
   assembly (strict + stylistic, suppression hygiene, shape caps, Sonar, test relaxations) with
   `eslint-plugin-sonarjs` and `@eslint-community/eslint-plugin-eslint-comments` as dependencies.
   Keep the exported name `config` and add `react-internal`. The example must still pass.
4. Add `@lvbt/playwright-config` (shared `defineConfig` base: `tests/e2e`, `.spec.ts`, trace on
   failure, desktop + mobile projects) and a `test:e2e` script slot in the example.
5. `@lvbt/typescript-config/astro.json` using the `extends` array over `astro/tsconfigs/strict` and
   `base.json`; add `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns` to `base.json`
   (transit-mapper's settings the org adopts).
6. Shared hooks gain: pre-commit (lint-staged Prettier + optional gitleaks), commit body rules
   (feat/fix require a body; 72-column wrap), agent-trailer requirement. Example gains a
   `lint-staged` block and `.gitleaks.toml`.
7. `@lvbt/cli` gains `lvbt check filenames` (transit-mapper's rule), `lvbt check contract` (every
   package declares `lint`, `check-types`, `test`; every dependency is `catalog:` or `workspace:*`;
   no test material outside `tests/`), and `lvbt check debt` (suppression ledgers only shrink). The
   example's `check` script includes them.
8. `lvbt deploy` iterates `apps/*` wrangler configs (with `--filter <app>`), and `lvbt bootstrap`
   grows the reversible phases both bootstrap scripts share today: workspace prerequisites,
   `gh auth status`, `wrangler whoami`, hooks path, lockfile-hash install check. Provisioning phases
   stay repo-owned until Phase 4.
9. Example CI gains `pnpm audit --audit-level=high` and the pinned gitleaks container step;
   `.claude/settings.json` gains the deny-list and Prettier post-edit hook.
10. Docs standard in the example: `docs/README.md`, `docs/development/tutorials/start-here.md`,
    `docs/development/reference/glossary.md`, `.markdownlint-cli2.jsonc` with
    `markdownlint-rule-relative-links`, and `markdownlint-cli2` in `check`.
11. Add `examples/with-astro` (site profile: Astro, Tailwind, Playwright, Workers static assets) and
    `examples/with-vite-react` (app profile) so labs, website, and transit-mapper each have a
    reference shape; `tests/example.test.mjs` proves all three.
12. Release: squash, push, PR, tag `v0.2.0`, create `template-basic`, `template-with-astro`,
    `template-with-vite-react` and the `TEMPLATE_PUBLISH_TOKEN` secret (user actions).

### Phase 1: org-level groundwork (GitHub settings, mostly user actions)

1. Push `labs` (make its first commit) and `transit-funding` to the org; register them and
   `analytics` in `standards/repositories.json`; apply the org ruleset (required `Validate`).
2. Create the `@LasVegasForTransit/maintainers` team that transit-mapper's CODEOWNERS already names;
   standard CODEOWNERS in the example: `* @LasVegasForTransit/maintainers`.
3. Install the Renovate GitHub app on every repo; confirm the `@lvbt/*` regex manager opens the
   grouped "LVBT repository standard" PR after the first tag.
4. Org `.github` repo: keep issue forms and the PR template there; delete local copies from
   transit-mapper and labs (they shadow the org's); add an org-level `CONTRIBUTING.md`,
   `SECURITY.md`, `CODE_OF_CONDUCT.md`, `SUPPORT.md` so the website stops relying on prose.
5. Label taxonomy for volunteers in every repo: `good first issue`, `help wanted`, `docs`, `bug`,
   `enhancement`, `dependencies`, `analytics-report`.

### Phase 2: converge each repo onto the standard (three PRs, labs first)

Order: labs (fewest moving parts, no history to protect), transit-mapper (closest already), website
(largest). Each PR follows `docs/how-to/adopt-in-an-existing-repository.md` and this checklist:

- Add `@lvbt/cli`, `@lvbt/eslint-config`, `@lvbt/typescript-config`, `@lvbt/prettier-config`,
  `@lvbt/vitest-config` (and `@lvbt/playwright-config` where e2e exists) as git-tag deps; replace
  the repo's own config packages and files with one-line configs extending them.
- Replace the catalog with the org catalog; pin exact versions; delete `minimumReleaseAge`
  leftovers; set `packageManager`/`engines`; remove `.nvmrc`/`.node-version`; switch the setup
  action to `node-version-file`.
- Rename scripts to the vocabulary: `verify` to `test`; website `lint` to `format`; `typecheck` to
  `check-types`; add `bootstrap`, `preflight`, `check`, `check:fix`, `deploy`.
- Install the standard hooks; create or move `.lvbt/commit-scopes.txt` (website's
  `allowed-scopes.txt`; transit-mapper's existing scope list; labs new: `home`, `transit-funding`,
  `brand`, `ui`, `tooling`, `docs`, `ci`, `dx`).
- Standard `ci.yml` Validate job; keep repo-owned extra workflows.
- Docs: move to domain-first layout, add glossary and start-here where missing, replace hand-written
  link checkers with `markdownlint-cli2`, fix the stale content the audit listed.
- Harness: standard `AGENTS.md` paragraphs, `CLAUDE.md` symlink, `.claude/settings.json`,
  `.codex/hooks.json`, `.agents/plugins/marketplace.json` pointing at `node_modules/@lvbt/cli`;
  delete the vendored plugin, pin file, and `scripts/check-repository-tooling.ts` (website).
- Fix the per-repo defects listed in the audit section.

Repo-specific notes:

- **labs**: delete or implement-later the documented-but-stubbed CLI commands (delete from README
  and `commands.md` now; keep `dev`, `preview`, `status`); remove `tooling/src/check.ts` in favor of
  `turbo run` tasks; keep `manifest.ts`, `workspace.ts` boundary check, and `preview.ts` as repo
  tooling; fix the contradictory e2e suites; move `apps/home` to
  `@lvbt/typescript-config/astro.json`; remove the vite 7 pin; drop unused `@lvbt/ui` or use it;
  delete `docs/development/reference/web-standard.md` and the two how-tos that describe the
  never-built preset, pointing at `repository-tooling` docs instead; add the deploy workflow from
  the `with-astro` example (routes for `labs.lasvegasfortransit.org` and per-lab paths).
- **transit-mapper**: replace `packages/config-eslint` and `packages/tsconfig` with the `@lvbt`
  packages (keep `packages/eslint-plugin` for `core-runtime-purity` and layer it via `extend`); keep
  knip, jscpd, dependency-cruiser, migrations, structure, breakpoint, icons, generators, reference
  checks as repo-owned `check:*` scripts run by the `validate` Turbo task; move `check:filenames`,
  `check:contract`, `check:debt` to `lvbt check`; add `.lvbt/commit-scopes.txt` from the remote;
  remove `apps/web/.env*`; set `minimumReleaseAge` or drop the excludes; fix the doc path in
  workflow comments; add a glossary.
- **website**: see Phase 3 for the structural move; in Phase 2 only the in-place changes: ESLint
  from zero (expect a suppression ledger on day one; that is what the ledger is for), Prettier
  config swap (one reflow commit with `proseWrap`), hooks swap (retire
  `scripts/validation/git/validate-commit-scope.ts` once body rules are shared), Node 22 fix, pnpm
  pin fix, run the orphan test through Vitest, pin `lychee-action`, delete duplicate MCP configs,
  purge stray PNGs, add `.editorconfig`, mark the two soft-failing jobs as either fixed (commit
  linux snapshots) or removed.

### Phase 3: website structural convergence

1. Move the Astro site to `apps/site`, the Pages Functions to `apps/worker` (Hono, same three
   routes), and `scripts/` to workspace tooling; root gains `turbo.json` and the standard scripts;
   `apps/site` extends `@lvbt/typescript-config/astro.json`.
2. Migrate Cloudflare Pages to Workers static assets: `apps/worker/wrangler.jsonc` with
   `assets.directory ../site/dist`, `run_worker_first ["/api/*"]`, custom domain
   `lasvegasfortransit.org`; `_headers` and `_redirects` keep working under static assets; preview
   deploys become Worker version previews; the `deploy-cloudflare-pages` action retires. Keep Pages
   serving until the Worker passes the existing header and Lighthouse checks at the canonical
   hostname, then cut DNS and delete the Pages project.
3. Keep the website's audit workflow (Lighthouse, axe, bundle and asset budgets, structured data,
   third-party scan) as repo-owned `check:*` scripts and a separate workflow; the standard does not
   absorb them yet.

### Phase 4: consolidate behavior that still lives in three copies

1. Bootstrap provisioning: fold website's seven phases and transit-mapper's six into
   `lvbt bootstrap` phases (`install`, `auth`, `workspace`, `env`, `provision`, `repo-config`,
   `ci-secrets`, `domain`) driven by `wrangler.jsonc` and a small `lvbt.config.json` per repo for
   names and domains; `--doctor` stays read-only.
2. Doc structure enforcement: transit-mapper's `check:documents` and labs' placement rules become
   `lvbt check docs` (required files and sections per domain, index completeness).
3. Release workflow template (`release-please` + attestation + smoke test) in the deployable
   examples; labs and website adopt it.
4. Retire repo copies as each shared piece lands; `knip` in every repo catches the leftovers.

### Phase 5: volunteer onboarding layer

1. Every repo: `docs/development/tutorials/start-here.md` written to the website's `writing-docs.md`
   bar (prerequisites, glossary links, expected output, errors explained); the example ships a
   template of it.
2. Org-wide `CONTRIBUTING.md` that names the identical commands (`pnpm bootstrap`, `pnpm check`),
   the commit grammar, and the PR template; each repo links it rather than restating it.
3. A `good first issue` backlog per repo seeded from the audit's small fixes; `help wanted` for the
   Phase 4 items.
4. `lvbt preflight` output and error messages reviewed against the same writing bar, since it is the
   first thing a volunteer runs.

### Phase 6: analytics (small; design already written)

The design lives at `analytics/docs/superpowers/specs/2026-09-01-analytics-standard-design.md`.
After Phase 2 lands on the website: ship `@lvbt/analytics` from the `analytics` repo (already
generated from the standard), the `events.lasvegasfortransit.org` collector Worker, and the weekly
report; wire the website (fix the missing `PUBLIC_LVBT_CWA_TOKEN` export, add the server-side
conversion hook and `/privacy`), then labs, transit-funding, and transit-mapper one PR each. The
analytics repo is the first consumer of `examples/basic`, so it also serves as the proof of the
standard.

## Verification

- Phase 0: `pnpm check` in `repository-tooling` (all example copies pass their own `check`, hooks
  enforce scopes and body rules, preflight passes); a real `pnpm install` of each example with
  `link:` packages; Renovate local extraction shows the `@lvbt/*` dependency; `create-turbo` from
  the tagged examples produces a passing repo.
- Phase 2, per repo: `pnpm bootstrap` then `pnpm check` green on a fresh clone; CI `Validate` green;
  a test commit with an invented scope is rejected by the hook; `pnpm exec lvbt preflight` reports
  all checks passing; production deploy unchanged (website: header and Lighthouse checks still pass;
  transit-mapper: release smoke tests pass).
- Phase 3: Worker preview passes the website's existing `headers-check`, Lighthouse prod preset, and
  axe suites before DNS cutover; rollback is the retained Pages deployment until deletion.
- Volunteer readiness test: a new contributor with only the org README clones any repo, runs the two
  commands, opens a PR from a `good first issue`, and CI, hooks, and the PR template behave
  identically across the three repos.

## Risks and open items

- Raising ESLint to the transit-mapper level will surface many findings in website and labs; the
  suppression ledger absorbs them without blocking, and `lvbt check debt` prevents growth.
- Renovate's handling of the `github:…&path:` specifiers is verified by extraction only; the first
  real tag proves the update PR.
- The website's Pages-to-Workers move is the riskiest step; it is sequenced last among structural
  changes and gated on the existing audits passing against the Worker.
- `labs` has no git history; its first commit should be the converged shape rather than the current
  tree, to avoid a large churn commit.
- GitHub template publishing needs a token with write access to the template repos; a fine-grained
  token scoped to those repos is the intended shape.
