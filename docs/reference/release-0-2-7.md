# Repository tooling 0.2.7

The repository contract accepts local `file:` dependencies on shared packages under
`.lvbt/web-platform/packages/`. Each reference must resolve to the canonical directory for the named
LVBT package, and that directory must declare the matching package name. Arbitrary local file
dependencies remain outside the standard.

This fixes the first Labs adoption failure against 0.2.6. Regression tests cover root and nested
importers, invalid paths, and mismatched package names. The dependency catalog is unchanged.
