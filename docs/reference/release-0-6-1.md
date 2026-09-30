# Repository tooling 0.6.1

The Astro and Vite templates now deploy through `cf` from a separate `apps/deploy` package. This
package reads the app's built static assets, preserving the existing Worker name, compatibility
date, preview URLs, observability, and missing-page behavior. New templates contain one deploy
target, so `lvbt deploy` cannot publish a second copy through Wrangler.

`lvbt deploy` builds the app before invoking `cf deploy`. New repositories must provide
`CLOUDFLARE_ACCOUNT_ID` and an account-owned `CLOUDFLARE_API_TOKEN` in their production GitHub
environment. `cf` is still in beta; its Wrangler build adapter remains an explicit dependency of the
deploy package.

The source and new templates pin patched `fast-uri` and both supported `undici` major lines to avoid
high-severity transitive advisories in the current toolchain.
