# Repository tooling 0.4.0

A repository can now declare everything its app needs in production in a `platform.json` beside the
app's production `wrangler.jsonc`. `pnpm preflight --production` reports whether production has all
of it without changing anything, and exits 1 until it does. `pnpm bootstrap --production` sets up
whatever is missing: it creates D1 databases, R2 buckets, Turnstile widgets, and Access
applications, applies migrations, stores secrets through standard input, and shows numbered
dashboard steps for what has no API. The [how-to guide](../how-to/set-up-production.md) walks
through it, and the [manifest reference](platform-manifest.md) lists every field.

`pnpm check` now also runs `lvbt check platform`, which validates any `platform.json` against the
schema that `@lasvegasfortransit/cli` ships. A repository without one passes unchanged, so updating
needs no other change. The example repositories list the two new commands in `AGENTS.md` and define
the platform manifest in their glossary.
