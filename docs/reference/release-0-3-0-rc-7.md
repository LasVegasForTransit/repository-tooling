# Repository tooling 0.3.0-rc.7

This release candidate adds reusable GitHub provisioning and diagnostics for pull-request preview
environments. Consumers can create a named environment, reconcile an explicit repository variable,
and verify that the environment, its deployment credential, and its enablement variable agree.

Environment and variable API targets reject unsafe repository, environment, and variable names
before any provider request. Existing production environment behavior remains unchanged. No stable
release is associated with this candidate; consumer validation still gates `v0.3.0`.
