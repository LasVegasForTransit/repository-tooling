# Repository tooling 0.3.0-rc.8

This release candidate gives Worker deployments a verifiable source identity. The shared deploy
command records the exact Git commit as the Worker version message and uses Wrangler strict mode to
reject conflicting remote configuration.

Deployment starts only from a clean Git checkout. GitHub Actions must match the triggering commit,
and the repository receives another integrity check after the production build and before each
upload. These checks support an auditable Labs migration handoff without changing the standard
commands used by contributors.

No stable release is associated with this candidate. Consumer migration acceptance still gates
`v0.3.0`.
