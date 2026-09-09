# Repository tooling 0.3.0-rc.5

This release candidate makes the suppression-debt validator recognize an unchanged ledger when its
package directory moves. Package renames no longer require an obsolete compatibility directory or an
empty ledger at the former path.

The candidate retains the provider-neutral custom-domain, Cloudflare Web Analytics, and GitHub
environment-secret provisioning contracts introduced in `0.3.0-rc.4`.
