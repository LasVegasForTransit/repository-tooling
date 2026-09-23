# Repository tooling 0.4.1

An Astro site now lints on a clean checkout. Astro writes the types for `astro:content` and its
environment only when it syncs or builds, so in CI, where nothing has done either yet, type-aware
lint rules rejected every module that imports them. Each Astro package now has a `sync` script
(`astro sync`), and `turbo.json` has a `sync` task that `lint` depends on. Turbo caches the
generated `.astro/` directory, so the task costs nothing when the content hasn't changed.

`pnpm standards:update` adds the script and the task to a repository with an Astro package, and
lists both files under the changes it made. `lvbt check contract` now requires them, so an Astro
package added later can't miss them. A repository without Astro changes nothing.

A repository that fixed this by hand with `astro sync && eslint .` in its lint script can put its
lint script back to `eslint . --max-warnings 0` after updating.
