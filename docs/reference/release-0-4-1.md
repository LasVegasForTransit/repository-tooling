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

The [standard scripts](cli.md#standard-scripts) reference now states the convention behind this:
each workspace package script runs one command, and Turbo orders the steps of a task. A package with
a second type program, such as a Worker, declares `check-types:worker`, and its own `turbo.json`
makes `check-types` depend on it. The examples follow the convention, and a test keeps them that
way. `lvbt check` does not enforce it in other repositories yet, so updating changes no scripts.
