# Repository tooling 0.3.0-rc.9

This release candidate adds a shared browser accessibility assertion to the LVBT web standard. The
assertion runs Axe against the WCAG 2.0, 2.1, and 2.2 A/AA rules selected by the organization and
reports every failing selector with its impact and remediation summary.

Astro and Vite/React project templates invoke the assertion in their first browser test. The exact
`@axe-core/playwright` version lives in the organization dependency catalog, so generated projects
receive the same audit behavior without adding repository-specific tooling.

No stable release is associated with this candidate. Consumer browser and migration acceptance still
gates `v0.3.0`.
