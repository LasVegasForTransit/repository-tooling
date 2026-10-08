# Retained releases from before attestation adoption

New shared release artifacts use format version 2 and require the configured signed proof. An
application adopting attestation can preserve exact older retained artifacts through a bounded
`release.attestation.legacyArtifacts` list in `.lvbt/tooling.json`:

```json
{
  "runId": "123456789",
  "sourceCommit": "0123456789012345678901234567890123456789",
  "artifactId": 123456789,
  "expiresAt": "2027-01-01T00:00:00Z"
}
```

Each record identifies one existing artifact, its successful staging run, full source commit and
actual GitHub retention deadline. Collect these public identifiers through read-only GitHub
inventory. Run and artifact IDs must be unique; at most 100 records are permitted. Adding an entry
does not create proof, rewrite the release identity or extend retention.

Compatibility applies only when signed proof is absent and the selected artifact has format
version 1. Before authorizing it, the library verifies the configured staging workflow, successful
run, repository and head repository, actual default branch, source commit, exact artifact ID/name,
expiry and complete artifact inventory. It downloads the retained release into a private temporary
directory, verifies every retained byte and requires its full inventory to match the selected
artifact. It checks remote metadata again and re-verifies the local bytes before returning. The
temporary download is removed on success or failure.

The shared source workflow outputs `legacy=true` only after verifying matching metadata twice. The
promotion caller forwards that value as `legacy-artifact` to the shared publish workflow so it can
omit the absent proof download and proof argument. This flag grants no CLI authorization: the
library performs the full checks independently before publication operations. Main staging continues
signing new artifacts. Invalid supplied proof never falls back to the legacy path.

New runs, format version 2, replacement artifact IDs, changed retention metadata, expired entries,
foreign or unsuccessful runs, ambiguous downloads and mismatched bytes fail. There is no wildcard or
permanent unsigned-release option. Remove expired records as routine manifest maintenance; rebuild
through staging when a retained artifact expires.

Original format-version-1 hashes remain unchanged. A legacy artifact without frozen SQL keeps its
original no-migration behavior; compatibility never substitutes SQL from the current checkout.
