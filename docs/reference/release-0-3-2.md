# Repository tooling 0.3.2

This patch migrates only the legacy references that identify platform packages. Application-owned
`@lvbt/*` packages remain unchanged, and vendored package paths remain intact for deterministic
local validation.
