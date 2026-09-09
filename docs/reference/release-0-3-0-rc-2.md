# Repository tooling 0.3.0-rc.2

This release candidate corrects the TypeScript package boundary introduced in 0.3.0-rc.1. Internal
imports use JavaScript module specifiers so consumer TypeScript configurations resolve the source
package without enabling TypeScript extension imports.

Pre-push validation also clears repository-local Git variables before running checks. Tests that
create disposable repositories remain isolated when invoked from a Git hook.
