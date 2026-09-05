# Repository tooling 0.2.6

This release adds the versioned `lvbt-web` vendor contract and a Node-native TypeScript updater.
Consumers record release and commit provenance, verify their local preset without network access,
and review updates before applying them. The updater preserves locally edited vendor files by
refusing replacement.

The shared package versions and example pins advance together. The dependency catalog remains
unchanged. Commit-hook tests now clear inherited Codex attribution context when exercising human
commits, while retaining explicit tests that require attribution for agent commits.

See [Web preset](web-preset.md) for adoption, update, and recovery procedures. Existing contribution
tooling, hooks, and package exports remain available.
