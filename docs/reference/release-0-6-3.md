# Repository tooling 0.6.3

Production manifests can select their Cloudflare account from `CLOUDFLARE_ACCOUNT_ID` with
`"accountIdEnv": "CLOUDFLARE_ACCOUNT_ID"`. Production preflight and bootstrap validate that
environment value before making account-scoped API calls. Existing literal `accountId` manifests
continue to work.

D1 bindings may omit the database ID when they name a database that appears exactly once in the
selected account inventory. An explicit, mismatched ID still blocks readiness and migrations. Cf
migrations use the ID returned by inventory, including after a database is created.
