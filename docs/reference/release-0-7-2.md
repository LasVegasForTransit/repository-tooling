# Repository tooling 0.7.2

The shared release runner now starts the CLI-owned TypeScript runtime using the current Node
executable. It no longer requires a second `tsx` dependency or a `pnpm exec tsx` executable in each
application root. This corrects the first Analytics staging build, whose existing package-local
runtime was unavailable from the repository root.

All seven packages, plugin manifests and generated template references advance together. Reusable
workflow and attestation signer pins remain the reviewed merged v0.7.0 source commit. Artifact
verification, protected staging, browser acceptance and explicit promotion are unchanged.

Adopt this patch with the standard updater. A real child-process regression runs the release entry
with no consumer executable on PATH, verifies its arguments, and proves that the CLI supplies its
runtime. The previous command fails that test before entering the release implementation.

The organization inventory also recognizes the canonical SHA-pinned shared audit workflow callers.
It previously warned about these correctly migrated workflows because it searched only for inline
audit commands. Actual generated callers are tested, including rejection of a moving branch ref.

Configuration inventory follows declared workspace package exports and relative imports at the same
verified commit. Repository wrappers that extend shared settings are accepted with source evidence;
independent settings continue to produce a diagnostic.
