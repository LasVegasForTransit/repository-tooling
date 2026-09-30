# Repository tooling 0.6.2

Production bootstrap now reaches Turnstile and Access setup even when cf has no local login. It
reports a warning because cf commands for D1 and R2 still need their own credential if those
resources need changes. Cf accepts an account API token from `CLOUDFLARE_API_TOKEN`; the short-lived
`LVBT_CLOUDFLARE_SETUP_TOKEN` remains limited to Turnstile and Access. Machine preflight now rejects
a cf response that explicitly says an API token is invalid.
