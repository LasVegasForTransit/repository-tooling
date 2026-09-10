# Web preset

The `lvbt-web` preset vendors an exact repository-tooling snapshot into `.lvbt/web-platform/`. It
contains the shared packages, dependency catalog, Astro and React templates, and the updater.
Consumer configuration imports these packages through local `file:` dependencies; shared rules
remain owned by repository-tooling.

`.lvbt/web-platform.json` records the format version, preset name, source commit, and SHA-256
content hash. A published snapshot also records its release tag. An unpublished snapshot records
`null` as its release. The hash covers the sorted file paths and exact UTF-8 contents. Integrity
validation reads local files only and rejects edited, missing, additional, and symbolic-link files.

Release tags identify standards that have completed consumer validation and publication. Work under
review uses a full commit SHA instead. Branch names, short SHAs, and sequential prerelease tags do
not identify development snapshots.

## Update a consumer

Run the vendored updater through the repository's standard command:

```sh
pnpm standards:update --release v0.2.7 --dry-run --json
pnpm standards:update --release v0.2.7 --apply
pnpm install
pnpm check
```

The updater fetches one explicit tag from `LasVegasForTransit/repository-tooling`. Dry run reports
added, changed, and removed files without changing the consumer. Apply replaces the vendor tree and
its provenance record. Locally edited vendor files stop the update rather than being erased. Commit
the vendor diff, provenance, and regenerated lockfile together after reviewing the catalog and
templates. Application-specific configuration and product files are not overwritten.

Consumer validation against an unpublished standard uses the reviewed commit directly:

```sh
pnpm standards:update --commit <full-commit-sha> --dry-run --json
pnpm standards:update --commit <full-commit-sha> --apply
pnpm install
pnpm check
```

The development snapshot keeps `release: null`. After publication, consumers update to the tagged
release commit and review its new commit and content hash.

For first adoption, run
`node standards/web-platform-cli.ts update --root /path/to/consumer --release v0.2.7 --apply` from a
repository-tooling checkout. A local tagged source is selected with
`--source /path/to/repository-tooling`. Use `--release <tag>` for a published standard or
`--commit <full-commit-sha>` for work under review. Both modes read committed files rather than the
working tree. Add consumer scripts pointing to the vendored CLI and local dependencies pointing to
its `packages/` directory.

## Recovery

Restore the vendor directory, provenance record, package manifests, and lockfile from the same
known-good consumer commit, then run `pnpm install --frozen-lockfile` and `pnpm check`. Do not
recalculate the recorded hash to accept a local edit. Fix the shared source and update from its
reviewed commit.
