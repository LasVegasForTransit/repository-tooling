# Repository tooling 0.2.8

The production Web Analytics variable is `PUBLIC_LVBT_CWA_TOKEN`. Provisioning writes that name, the
infrastructure doctor requires it, and preview configuration removes it before upload. This matches
the public build-time contract exposed by `@lvbt/analytics` in Astro and Vite projects.

Consumers update the vendored preset, run `pnpm provision --apply`, and remove the obsolete
`CLOUDFLARE_WEB_ANALYTICS_TOKEN` environment variable after the new variable passes `pnpm doctor`.
The dependency catalog is unchanged.
