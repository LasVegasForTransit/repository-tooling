# Web preset

The `lvbt-web` preset vendors a tagged repository-tooling release into `.lvbt/web-platform/`. It
contains the shared packages, dependency catalog, Astro and React templates, and the updater.
Consumer configuration imports these packages through local `file:` dependencies; shared rules
remain owned by repository-tooling.

`.lvbt/web-platform.json` records the format version, preset name, release tag, source commit, and
SHA-256 content hash. The hash covers the sorted file paths and exact UTF-8 contents. Integrity
validation reads local files only. It rejects edited, missing, additional, and symbolic-link files.
This detects drift; it is not a substitute for reviewing or trusting the upstream release.

## Update a consumer

Run the vendored updater through the repository's standard command:

```sh
pnpm standards:update --release v0.2.6 --dry-run --json
pnpm standards:update --release v0.2.6 --apply
pnpm install
pnpm check
```

The updater fetches one explicit tag from `LasVegasForTransit/repository-tooling`. Dry run reports
added, changed, and removed files without changing the consumer. Apply replaces the vendor tree and
its provenance record. Locally edited vendor files stop the update rather than being erased. Commit
the vendor diff, provenance, and regenerated lockfile together after reviewing the catalog and
templates. Application-specific configuration and product files are not overwritten.

For first adoption, run
`node standards/web-platform-cli.ts update --root /path/to/consumer --release v0.2.6 --apply` from a
repository-tooling checkout. A local tagged source is selected with
`--source /path/to/repository-tooling`; the updater still reads the committed tag, never unstaged
files. Add consumer scripts pointing to the vendored CLI and local dependencies pointing to its
`packages/` directory.

## Recovery

Restore the vendor directory, provenance record, package manifests, and lockfile from the same
known-good consumer commit, then run `pnpm install --frozen-lockfile` and `pnpm check`. Do not
recalculate the recorded hash to accept a local edit. Fix the shared source and release it.
