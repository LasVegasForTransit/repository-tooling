# Retained Worker releases

The shared release commands publish the exact compiled Worker, assets, settings, and SQL retained by
the selected successful source run. Production publication is an explicit manual promotion. Named
profiles select an app with `--app`; the artifact and live marker identify that app in addition to
its source commit and run. A nested app declares a normalized `publicPath`, such as
`/transit-funding/`, while its `productionUrl` remains the reviewed HTTPS origin.

New artifacts use format version 2. The version 1 reader preserves existing artifact hashes and file
inventories. Verified version 1 artifacts without retained SQL keep their original behavior and do
not apply migrations. A version 2 release declaring migrations must carry its frozen SQL;
publication never fills missing SQL from the current checkout.

## Schema changes

Declare each migration binding and its app-relative directory under `release.migrations`. The
producer seals the exact SQL bytes and selected database identities into the artifact. Preview SQL
applies before candidate requests and browser acceptance. Production SQL applies after candidate
acceptance and immediately before explicit activation.

Release migrations must be additive and compatible with the currently serving application: preview
and production continue serving their previous version while schema changes apply. Destructive
changes require a separately reviewed maintenance process. A migration command can fail after
earlier files have applied; reconcile the selected database's applied migrations before retrying or
promoting. The command cannot roll back applied SQL.

## Durable Objects and named staging

Workers implementing Durable Objects cannot use version URLs. Declare
`publicationMode: "named-staging"` to deploy the saved artifact to the configured protected preview
Worker for acceptance. Anonymous Access denial is required before staging deployment. The preview
Worker has separate D1 and Durable Object namespaces, and preview cron schedules remain disabled.
Production activation deploys the same saved bytes and settings, preserving its declared Durable
Object class and namespace identity.

The shared workflow serializes staging and promotion for each repository and app. Production
promotion uses a separate credential environment after a successful preview acceptance job. Its
immutable receipt binds the current manual Actions run and attempt, reviewed tools revisions,
selected source and artifact hash, app, preview namespace, and acceptance outcome. Production
activation checks the successful job and downloads the exact same-run proof through GitHub before
writing provider state. Credentials remain in their respective environments. Standalone activation
requires live protected preview verification or this verified current-run receipt. Unknown provider
outcomes require reconciliation rather than automatic retry.

A deliberately shared public R2 dataset can be declared in `previewReadOnlyBindings`. Only a
matching R2 binding is eligible. The generated staging wrapper exposes `get`, `head`, and `list` and
rejects writes, including from exported Durable Objects. Other mutable preview resources remain
separate. Packaging and pre-publication verification inspect every compiled JavaScript module:
native `cloudflare:workers` imports may select only the `DurableObject` superclass. Global binding
imports, namespace imports, re-exports, dynamic native imports, and dynamic imports whose target
cannot be verified are rejected. This supports reviewed applications that receive bindings through
their handler or Durable Object constructor arguments; it is not a sandbox for arbitrary code. Rate
limiter namespace IDs are account scoped and must remain distinct in preview. Draft profiles declare
`previewOnly: true`; shared promotion and production writes reject them.
