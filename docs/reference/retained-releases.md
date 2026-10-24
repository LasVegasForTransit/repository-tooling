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

The publisher's `CLOUDFLARE_API_TOKEN` remains in effect for Worker-version preconditions.
`CLOUDFLARE_MIGRATIONS_API_TOKEN` selects a separate credential only for the D1 apply subprocess; it
is never passed as a command argument. Omitting the separate key preserves the existing default
credential fallback, while explicitly supplying an empty key fails before SQL. The shared workflow
maps the separate credential without replacing the publisher's token. See
[release credential setup](../how-to/set-up-a-web-release.md#keep-worker-and-migration-credentials-separate).

## Durable Objects and named staging

Workers implementing Durable Objects cannot use version URLs. Declare
`publicationMode: "named-staging"` to deploy the saved artifact to the configured protected preview
Worker for acceptance. Anonymous Access denial is required before staging deployment. The preview
Worker has separate D1 and Durable Object namespaces, and preview cron schedules remain disabled.
Production activation deploys the same saved bytes and settings, preserving its declared Durable
Object class and namespace identity.

Named deployments update Worker code and bindings without managing custom-domain routes. Existing
route mappings stay attached to their Workers, so a release does not need zone write access or
change routing while uploading or activating the saved artifact.

An app can keep version URLs for pull request previews and use named staging for production by
setting `publicationMode: "version"` and `productionPublicationMode: "named-staging"`. The
production promotion workflow passes `publication-mode: named-staging` to the shared publisher.
Production acceptance then runs on the protected preview Worker before the publisher deploys the
retained bytes to the public Worker. The generated production configuration disables version URLs;
the preview configuration keeps them for isolated pull request previews. When
`productionPublicationMode` is omitted, production uses `publicationMode` for backward
compatibility.

The shared workflow serializes staging and promotion for each repository and app. Production
promotion uses a separate credential environment after a successful preview acceptance job. Its
immutable receipt binds the current manual Actions run and producing attempt, reviewed tools
revisions, selected source and artifact hash, app, preview namespace, and acceptance outcome.
Production activation checks that attempt's successful job and downloads the exact same-run proof
through GitHub before writing provider state. Credentials remain in their respective environments.
Standalone activation requires live protected preview verification or this verified current-run
receipt. Unknown provider outcomes require reconciliation rather than automatic retry.

Applications adopting signed artifacts can preserve exact older retained format-version-1 releases
through the bounded [legacy attestation policy](legacy-release-attestations.md). Every use verifies
their remote provenance and retained bytes; newly produced artifacts always require signed proof.

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

## Retained recovery and first adoption

Promotion accepts `--expected-version <current Worker UUID>` as an optimistic production
precondition. A reusable caller exposes the manual `expected_version` input and passes it to
`release-publish.yml` as `expected-version`. The production credential job checks the authenticated
configured Worker before recording its baseline, and checks again before SQL, upload, and
activation. A changed version or traffic split stops those production writes. Named candidate
acceptance remains in the preview environment and cannot use production credentials.

For first adoption, an older application may have a legacy marker or no shared marker. This is
accepted only when an explicit expected version matches the authenticated production Worker. The
publication receipt records `baselineEvidence` with the provider version and any recognized legacy
marker fields; it does not invent a shared release ID or claim that old bytes were retained. Missing
or nonmarker pages are distinguished from authentication, redirects, server failures, and timeouts,
which still stop publication. The new selected artifact and its protected preview must pass their
normal verification. Older provider versions without saved release artifacts need an explicit
recovery process; they cannot be promoted as though their bytes were captured.

An uncertain promotion outcome still requires inspecting the unique request, publication receipt,
and current provider state. Do not redispatch automatically. Worker recovery does not reverse SQL or
other persistent data changes.

### Retry an activation that did not change production

First reconcile the failed activation's publication receipt, the configured Worker's current
version, and its live release marker. A failed command alone does not prove that production stayed
unchanged. Reconcile any partially applied SQL as described above before retrying.

When production is confirmed unchanged, use **Re-run failed jobs** on the same manual promotion run.
The activation job downloads the immutable artifact ID exported by its successful candidate
dependency, including when that candidate ran on an earlier attempt. Verification checks the
producer attempt's successful candidate job, exact retained proof bytes, selected release and app,
tools revisions, and preview namespace. It accepts only the same run and a producing attempt no
later than the current one. The existing production-version precondition still runs before SQL and
activation; a changed version or traffic split stops publication.

If the candidate artifact reference is missing or its retained proof has expired, rerun **all jobs**
in that same run to stage and verify a new candidate before activation. Missing, mismatched, or
unsuccessful proof fails closed. Never rename a receipt, edit its attempt, substitute proof from
another run, or bypass the production-version check. A retry uses the run's original tools and
workflow revisions; it does not install this recovery fix into an older run. After adopting the
matching tooling and reusable publisher workflow, start a fresh manual promotion for such a run only
after reconciling production and selecting its current version precondition.
