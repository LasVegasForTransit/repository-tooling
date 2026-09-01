# The pin file

`.lvbt/repository-tooling.json` records which release a repository vendored and what the vendored
files hashed to. `check` reads it; `init` and `update` write it. Never edit it by hand.

```json
{
  "schemaVersion": 2,
  "repository": "LasVegasForTransit/repository-tooling",
  "ref": "v0.2.0",
  "commit": "1a2b3c4d…",
  "plugin": "lvbt-contributions",
  "version": "0.2.0",
  "sha256": "…",
  "managedPaths": ["plugins/lvbt-contributions", ".lvbt/repository-tooling", "…"],
  "files": { "plugins/lvbt-contributions/scripts/github-create.mjs": "…", "…": "…" }
}
```

| Field           | Meaning                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------- |
| `schemaVersion` | Pin format. `2` since v0.2.0. Older pins have no field and are migrated by `update`.     |
| `repository`    | Source repository. `check` rejects anything but the organization's.                      |
| `ref`           | Release tag vendored. Also written into `.claude/settings.json`.                         |
| `commit`        | Full commit the tag pointed at when vendored.                                            |
| `plugin`        | Name of the agent plugin; both harness manifests must agree.                             |
| `version`       | Plugin version from the release's manifest.                                              |
| `sha256`        | One digest over every managed file, so a single comparison proves nothing drifted.       |
| `managedPaths`  | The paths the digest covers, so `check` needs no knowledge beyond the pin.               |
| `files`         | Per-file digests, so a failed check can name the file that changed.                      |

The digest hashes each managed file's relative path and content in sorted order. A file added
under a managed path, removed from it, or edited in place changes the digest.
