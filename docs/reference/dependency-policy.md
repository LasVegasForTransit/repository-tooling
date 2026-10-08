# Dependency policy

The CLI's `catalog.json` owns the organization dependency baseline and audited transitive
`overrides`. The standard updater projects those overrides into `pnpm-workspace.yaml`, preserving
application-only selectors and comments. Change a shared pin upstream. Missing or differing shared
pins warn in 0.7 and fail from adopted 0.8 releases.

Dependency checks keep their existing scope and severity budget. Templates check all dependencies at
the high-severity threshold. Applications that already check production dependencies retain that
scope. Required security checks run uncached through Turbo validation; scheduled audit reports use
the shared reporting adapters.

## Temporary Braces backport

[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) affects published Braces
through 3.0.3. There is no official published fix as of October 7, 2026. The standard temporarily
pins `braces` to the exact published `@dieub/braces-depth-guard@3.0.3-pn.3` backport.

The reviewed implementation bounds brace and parenthesis nesting, recursive AST operations and
parent traversal, including oversized depth settings and cyclic ASTs. Its published files match
[source commit 305a2e4](https://github.com/dieub/braces-depth-guard/tree/305a2e4bfe324bb53c336c1b03387ee1251c926f).
Registry signatures and npm publication provenance were verified against that commit and its tag.
The tarball integrity is:

```text
sha512-QY+Uq4s42STyIMPoRkBuUZfYyvz0uZuwuUburLwMx5N+lWqnHHaBxcKPtgKVKjTyFnS1q4ivKu9Wxi4VG7FE9Q==
```

Review ran the original compatibility suite, adversarial depth and cycle cases, and real Micromatch
and Fast-glob operations against the published runtime. Checked-in regressions exercise the actual
installed transitive dependency. Consumer acceptance still requires the complete validation gate and
the unchanged high-severity audit; changing a package name does not establish recovery.

This is a third-party backport. Replace the alias when an official published Braces release passes
these security and compatibility cases. Make that replacement once in the shared catalog and adopt
it through the normal standard update. Do not add consumer patches or advisory exclusions.

## Sharp security fix

The shared pin selects Sharp 0.35.5, the published fix for
[GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w). Consumer locks must
resolve the fixed version before validation and staging acceptance.

The baseline also selects the published fixes Devalue 5.9.4, HTTP Cache Semantics 4.3.0, and Source
Map JS 1.2.2 for advisories found in the complete tooling dependency tree. These pins are shared
with consumers through the same updater rather than kept as application workarounds.
