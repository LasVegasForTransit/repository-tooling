# Repository tooling 0.3.0

Shared packages now publish through GitHub Packages as `@lasvegasfortransit/*`. The previous
`@lvbt/*` scope identifies a GitHub user rather than the LasVegasForTransit organization, so it
cannot publish organization-owned packages.

Consumers update their scoped registry configuration, replace `@lvbt/*` dependencies with the new
scope, and install the exact release. Published templates continue to vendor the release under
`.lvbt/web-platform`, so their shared configuration remains local after bootstrap.
