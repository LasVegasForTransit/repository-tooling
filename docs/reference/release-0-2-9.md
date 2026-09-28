# Repository tooling 0.2.9

The template repositories now vendor the standard in `.lvbt/web-platform/`, the same way every other
repository does, instead of installing the shared packages from a git tag. A repository created from
a template therefore validates without network access or a registry token.

`pnpm provision` also recognizes Cloudflare Web Analytics sites that report their hostname at the
top level of the API response, so a site created by the current dashboard is no longer provisioned
twice. Nothing changes for a repository that updates.

These notes were written after the release, which shipped without them.
