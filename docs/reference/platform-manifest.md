# Platform manifest reference

A platform manifest is a file named `platform.json` that lists everything one app needs in
production: its Cloudflare Worker, D1 databases, R2 buckets, Turnstile widgets, Access applications,
email sending domain, secrets, vars, GitHub environment secrets, and the values that must never be
set there. The repository owns it. It usually lives at `apps/<app>/platform.json`, or at the
repository root for a single-app repository. Its production config can live in a sibling deploy
package. It never lives under `.lvbt/`, because that directory is vendored.

`pnpm preflight --production` compares the manifest with what exists and prints a readiness report.
`pnpm bootstrap --production` sets up what is missing. `pnpm check` validates the manifest's shape
on every commit through `lvbt check platform`. The [command reference](cli.md#production-checks)
describes the commands; this page describes the file.

The schema ships in `@lasvegasfortransit/cli` as `platform.schema.json`. Point `$schema` at it so an
editor completes and checks the fields as you type:

```json
{
  "$schema": "../../node_modules/@lasvegasfortransit/cli/platform.schema.json",
  "version": 1,
  "name": "example.org",
  "cloudflare": {
    "accountIdEnv": "CLOUDFLARE_ACCOUNT_ID",
    "zone": { "name": "example.org", "id": "fedcba9876543210fedcba9876543210" },
    "worker": "example"
  },
  "d1": [{ "binding": "DB", "name": "example", "migrations": "migrations" }],
  "secrets": [
    {
      "name": "SIGNING_SECRET",
      "purpose": "Signs one-time links so they cannot be forged.",
      "generate": true
    }
  ],
  "forbidden": [
    {
      "name": "PREVIEW_ADMIN_KEY",
      "reason": "It opens the admin views without sign-in, so it belongs only on the preview."
    }
  ]
}
```

The complete lvwwd.org manifest in `LasVegasForTransit/week-without-driving` at
`apps/site/platform.json` uses every section.

## Top-level fields

| Field        | Required | Meaning                                                                  |
| ------------ | -------- | ------------------------------------------------------------------------ |
| `$schema`    | no       | The path to `platform.schema.json`, for editors.                         |
| `version`    | yes      | Always `1`.                                                              |
| `name`       | yes      | What people call the production site, such as `lvwwd.org`.               |
| `cloudflare` | yes      | The account, zone, and Worker. See below.                                |
| `d1`         | no       | D1 databases the Worker binds.                                           |
| `r2`         | no       | R2 buckets the Worker binds.                                             |
| `turnstile`  | no       | Turnstile widgets.                                                       |
| `access`     | no       | Cloudflare Access applications.                                          |
| `email`      | no       | Domains the Worker sends email from.                                     |
| `secrets`    | no       | Secret values on the Worker or in GitHub environments. Never the values. |
| `vars`       | no       | Plain-text vars that must be in the production config.                   |
| `github`     | no       | The repository whose environments hold `github:` secrets.                |
| `forbidden`  | no       | Names that must never be set in production.                              |

## `cloudflare`

| Field              | Required     | Meaning                                                                                                |
| ------------------ | ------------ | ------------------------------------------------------------------------------------------------------ |
| `accountId`        | one of these | The 32-character ID of the account that owns the Worker and the zone.                                  |
| `accountIdEnv`     | one of these | Set to `CLOUDFLARE_ACCOUNT_ID` to read that ID from the environment at production check or setup time. |
| `zone.name`        | yes          | The zone, such as `lvwwd.org`.                                                                         |
| `zone.id`          | one of these | The zone's 32-character ID, from the zone's Overview page in the dashboard.                            |
| `zone.idEnv`       | one of these | Environment variable containing that verified public zone ID, such as `LVBT_ZONE_ID`.                  |
| `worker`           | yes          | The production Worker's name. It must equal the configured Worker name.                                |
| `cloudflareConfig` | no           | Canonical `cloudflare.config.ts`, relative to the manifest. Selects cf deployment.                     |
| `wranglerConfig`   | no           | Legacy production Wrangler config, relative to the manifest. Defaults to `wrangler.jsonc`.             |

When `cloudflareConfig` is set, preflight imports that file and checks its Worker name and `env`
bindings. It does not validate a retained Wrangler mirror in its place. Without it, preflight reads
the Wrangler config's top-level `name`, `vars`, `d1_databases`, and `r2_buckets`; it does not read
`env.*` sections.

Use exactly one of `accountId` and `accountIdEnv`. The environment form keeps the account identifier
out of the manifest. Set `CLOUDFLARE_ACCOUNT_ID` to a 32-character account ID before running
`pnpm preflight --production` or `pnpm bootstrap --production`. The latter can still copy that ID to
a declared GitHub deploy secret.

Use exactly one of `zone.id` and `zone.idEnv`. Production readiness resolves and validates a
declared environment value before contacting the provider; unset or malformed IDs stop the
operation. Local development needs neither identifier.

## `d1` and `r2`

| Field        | Required | Meaning                                                                                |
| ------------ | -------- | -------------------------------------------------------------------------------------- |
| `binding`    | yes      | The binding name in the production config, such as `DB`.                               |
| `name`       | yes      | The database or bucket name in Cloudflare.                                             |
| `migrations` | no (D1)  | The migrations directory, relative to the manifest. Every `.sql` file must be applied. |

The check fails when the database or bucket does not exist, when the production config does not bind
it under `binding`, or when an explicit database ID differs from the real database. A name-only D1
binding is accepted only when inventory finds exactly one database with that name in the selected
account. It reads the applied migrations from the database's `d1_migrations` table (or the
`migrations_table` the config names) with a read-only query. Setup applies only migrations that are
not applied yet, and only while the config names the observed database. Cf applies them by the
observed database ID for cf projects; Wrangler applies them to the database the legacy config names.

## `turnstile`

| Field        | Required | Meaning                                                                        |
| ------------ | -------- | ------------------------------------------------------------------------------ |
| `name`       | yes      | The widget's name in the dashboard.                                            |
| `domains`    | yes      | The hostnames the widget runs on.                                              |
| `mode`       | no       | `managed` (the default), `non-interactive`, or `invisible`.                    |
| `siteKeyVar` | yes      | The var that carries the public site key. It must be listed in `vars`.         |
| `secret`     | yes      | The Worker secret that carries the secret key. It must be listed in `secrets`. |

Setup creates the widget when none has this name or covers these domains, stores its secret key on
the Worker, and prints the site key to put in the wrangler config's `vars`. When it widens an
existing widget to cover more domains, it keeps the widget's other settings.

## `access`

| Field              | Required | Meaning                                                                                                                                                                      |
| ------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`             | yes      | The application's name in Zero Trust.                                                                                                                                        |
| `destinations`     | yes      | Host and path pairs to protect. List both `example.org/admin` and `example.org/admin/*`: a path does not cover the paths under it, and a wildcard does not cover its parent. |
| `sessionDuration`  | no       | How long a sign-in lasts, such as `24h`. Defaults to `24h`.                                                                                                                  |
| `identityProvider` | yes      | `google-apps` for Google Workspace, or `onetimepin` for an emailed code.                                                                                                     |
| `allow`            | yes      | Exactly one of `googleGroup` (a Workspace group address), `emailDomain`, or `emails`.                                                                                        |
| `teamDomainSecret` | yes      | The Worker secret that carries the Zero Trust team domain.                                                                                                                   |
| `audienceSecret`   | yes      | The Worker secret that carries the application's audience (AUD) tag.                                                                                                         |

Setup creates a reusable policy named `<name> allow` and the application, with instant sign-in
through the one identity provider, then stores the new audience tag on the Worker straight away,
since any older one belongs to another application. It stores the team domain only when the
`teamDomainSecret` is not set yet. The check fails when the application does not protect a declared
path, has another session length, offers another identity provider, lacks an allow policy for the
declared people, or has an allow policy that lets everyone in; fixing that last one detaches the
policy that lets everyone in. Turning on Cloudflare One (Zero Trust), connecting Google Workspace,
and creating a `googleGroup` have no API, so setup shows the dashboard steps for them. Setup cannot
read Google Groups either, so it asks the person to confirm the group exists and remembers a yes on
that computer; until then, the group is reported as a warning. When Cloudflare One is already on,
the report shows its team domain, such as `lvbt.cloudflareaccess.com`, and its team name, and skips
those steps.

## `email`

| Field          | Required | Meaning                                                                                |
| -------------- | -------- | -------------------------------------------------------------------------------------- |
| `domain`       | yes      | The domain in the From address.                                                        |
| `provider`     | yes      | `resend`. The provider decides which DNS records are checked.                          |
| `dnsProfile`   | no       | `ses` (the default) for legacy MX/SPF records, or `forge` for Resend's CNAME records.  |
| `region`       | no       | The provider's sending region. Defaults to `us-east-1`.                                |
| `apiKeySecret` | no       | The Worker secret that carries the provider's API key. It must be listed in `secrets`. |

Set `dnsProfile` to match the records shown on the domain's Resend page. The default `ses` profile
checks the legacy `send` MX and SPF records. The `forge` profile checks `rsend` and `send` CNAMEs
pointing to `rsend.forge.rmta.net` and `send.forge.rmta.net`. Both profiles require the
`resend._domainkey` DKIM TXT record and recommend `_dmarc` TXT. The check uses public DNS and needs
no credential. A passing DNS check does not confirm Resend has marked the domain Verified or that a
message can be delivered; check the domain in Resend and send a test message before launch.

## `secrets`

| Field         | Required | Meaning                                                                                                                                                                    |
| ------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | yes      | The name in capitals, such as `RESEND_API_KEY`.                                                                                                                            |
| `purpose`     | yes      | What production uses it for, in one sentence.                                                                                                                              |
| `use`         | no       | `live` (the default): production is not ready without it. `future`: only a feature that is not built yet needs it, so it only warns.                                       |
| `neededFor`   | no       | The feature that does not work without it, as a phrase that follows "needed for".                                                                                          |
| `targets`     | no       | Where it is stored: `worker`, or `github:<environment>`. Defaults to `worker`.                                                                                             |
| `url`         | no       | The page to open first. Setup offers to open it.                                                                                                                           |
| `steps`       | no       | Numbered, click-by-click steps to find or create the value, each one complete sentence. See the rules below.                                                               |
| `generate`    | no       | `true` when setup should mint a random value (32 random bytes) instead of asking.                                                                                          |
| `sensitive`   | no       | `false` for a value that is not a credential, such as an account ID, a team domain, or an Access audience tag. Setup asks for it visibly and shows it. Defaults to `true`. |
| `from`        | no       | `cloudflare.accountId` to copy the manifest's account ID.                                                                                                                  |
| `pattern`     | no       | A regular expression a pasted value must match.                                                                                                                            |
| `patternHint` | no       | What a valid value looks like, shown when a pasted value does not match.                                                                                                   |

Write `steps` for someone who has never used the service. Say exactly what to type or choose in each
field, and use the same names the manifest uses, so setup recognizes what the person makes. Never
ask for a second copy before the first is pasted: the step that copies a value also says where to
paste it, and the last step copies the value this secret needs, to paste at the prompt. When a value
is needed in two places, say to paste it in both before copying anything else. The standard's own
guides follow the same rules.

A secret gets its value from exactly one place: `generate`, `from`, a Turnstile widget or Access
application that names it, or a person. A secret a person types in must have `steps`, so the person
is never left guessing where the value comes from; the
[set-up guide](../how-to/set-up-production.md#what-to-enter-in-each-dashboard) has reviewed steps
for the common ones to copy. A value a Turnstile widget or Access application feeds is asked for
only when setup cannot read it, and then with the standard's own steps, which walk through creating
the resource.

Setup hides only credentials. A secret marked `"sensitive": false` is typed with visible input, and
its value is printed when setup stores it and shown in the report beside "is set", as the value that
should be there, whenever setup can work it out (the account ID, the team domain, or an
application's audience tag). A generated secret is always a credential. Every other secret is typed
hidden and never printed.

Setup can see only whether a secret exists, never its value. So it never replaces a secret that is
set: it does not ask for it, generate it, or copy it again. A resource created during a run always
stores its new value, since any older one is stale. A generated secret that is set on one target but
missing from another is reported, not generated again, because a second random value would leave the
targets disagreeing. To replace a value on purpose, run
`pnpm bootstrap --production --rotate <NAME>`.

## `vars`

| Field       | Required | Meaning                                           |
| ----------- | -------- | ------------------------------------------------- |
| `name`      | yes      | The var's name.                                   |
| `purpose`   | yes      | What production uses it for, in one sentence.     |
| `use`       | no       | `live` (the default) or `future`, as for secrets. |
| `neededFor` | no       | As for secrets.                                   |

A var must be in the wrangler config's `vars`, because a deploy replaces every var with what the
config says. Setup never edits the config. It prints the line to add, so the change goes through
review. A var that a Turnstile widget feeds must equal that widget's site key.

## `github`

| Field        | Required | Meaning                                                                   |
| ------------ | -------- | ------------------------------------------------------------------------- |
| `repository` | yes      | `owner/name`. Required when any secret or forbidden entry targets GitHub. |

Setup creates a missing environment before it stores the environment's secrets.

## `forbidden`

| Field      | Required | Meaning                                                           |
| ---------- | -------- | ----------------------------------------------------------------- |
| `name`     | yes      | The name that must not be set.                                    |
| `reason`   | yes      | Why, in one sentence the report prints.                           |
| `targets`  | no       | As for secrets. Defaults to `worker`.                             |
| `severity` | no       | `error` (the default) fails the check; `warning` only reports it. |

On the Worker, the check looks for the name as a secret, in the wrangler config's `vars`, and in the
deployed Worker's vars. A name cannot be both declared and forbidden. Use `warning` for a temporary
switch that production is allowed to carry for a while, such as a var that turns a check off until
its service is set up.

## Rules the schema cannot express

`lvbt check platform` also fails when a name is declared twice, when a resource feeds a secret or
var the manifest does not declare, when a fed secret does not target the Worker, when an Access
application allows a Google group without the `google-apps` identity provider, when a GitHub target
has no `github.repository`, and when a `pattern` is not a valid regular expression.
