# Repository tooling 0.3.1

`pnpm standards:update` now migrates consumer references from `@lvbt/*` to `@lasvegasfortransit/*`
as it replaces the vendored preset. This makes the organization namespace change one deterministic
consumer update instead of a manual follow-up.
