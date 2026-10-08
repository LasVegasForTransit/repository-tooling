# Repository tooling 0.7.0

Local bootstrap and preflight no longer require publishing credentials. Bootstrap validates the
toolchain before installing dependencies and preserves existing local environment files. Configure
local examples and optional integrations through the versioned tooling declaration. Production setup
remains explicit through `--production`. Documented future-only credentials are never provisioned or
rotated; generated secrets wait while another target cannot be observed.

`lvbt check` now verifies standard integrity and reports command-contract drift. Consumer root
commands match the templates, with product checks ordered by Turbo. New command rules warn in this
minor release and become required in 0.8.0.

`lvbt audit` runs shared link, Lighthouse, and dependency adapters. Trusted scheduled reports
maintain one readable issue per check and target through the contribution helper, including verified
recovery and regression handling. Errors and incomplete checks cannot close issues.

The web-platform package now provides shared saved-release orchestration and `lvbt promote`. Main
updates staging; production promotion verifies a saved artifact without rebuilding. Previously
retained website artifacts remain readable. Consumers migrate their application-owned workflows and
configuration explicitly; updating the vendor snapshot alone does not complete adoption.

See [Developer workflow](developer-workflow.md) for the command contract and ownership boundaries.
