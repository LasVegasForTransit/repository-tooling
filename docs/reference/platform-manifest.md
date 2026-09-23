# Platform manifest reference

A platform manifest is a file named `platform.json` that lists everything one app needs in
production: its Cloudflare Worker, D1 databases, R2 buckets, Turnstile widgets, Access applications,
email sending domain, secrets, vars, GitHub environment secrets, and the values that must never be
set there. The repository owns it. It lives next to the app's production `wrangler.jsonc`, usually
at `apps/<app>/platform.json`, or at the repository root for a single-app repository. It never lives
under `.lvbt/`, because that directory is vendored.

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
    "accountId": "0123456789abcdef0123456789abcdef",
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
| `vars`       | no       | Plain-text vars that must be in the wrangler config.                     |
| `github`     | no       | The repository whose environments hold `github:` secrets.                |
| `forbidden`  | no       | Names that must never be set in production.                              |

## `cloudflare`

| Field            | Required | Meaning                                                                                 |
| ---------------- | -------- | --------------------------------------------------------------------------------------- |
| `accountId`      | yes      | The 32-character ID of the account that owns the Worker and the zone.                   |
| `zone.name`      | yes      | The zone, such as `lvwwd.org`.                                                          |
| `zone.id`        | yes      | The zone's 32-character ID, from the zone's Overview page in the dashboard.             |
| `worker`         | yes      | The production Worker's name. It must equal `name` in the wrangler config.              |
| `wranglerConfig` | no       | The production wrangler config, relative to the manifest. Defaults to `wrangler.jsonc`. |

The check reads the wrangler config's top-level `name`, `vars`, `d1_databases`, and `r2_buckets`. It
does not read `env.*` sections.

## `d1` and `r2`

| Field        | Required | Meaning                                                                                |
| ------------ | -------- | -------------------------------------------------------------------------------------- |
| `binding`    | yes      | The binding name in the wrangler config, such as `DB`.                                 |
| `name`       | yes      | The database or bucket name in Cloudflare.                                             |
| `migrations` | no (D1)  | The migrations directory, relative to the manifest. Every `.sql` file must be applied. |

The check fails when the database or bucket does not exist, when the wrangler config does not bind
it under `binding`, and when the config's `database_id` differs from the real database. It reads the
applied migrations from the database's `d1_migrations` table (or the `migrations_table` the config
names) with a read-only query.

## `turnstile`

| Field        | Required | Meaning                                                                        |
| ------------ | -------- | ------------------------------------------------------------------------------ |
| `name`       | yes      | The widget's name in the dashboard.                                            |
| `domains`    | yes      | The hostnames the widget runs on.                                              |
| `mode`       | no       | `managed` (the default), `non-interactive`, or `invisible`.                    |
| `siteKeyVar` | yes      | The var that carries the public site key. It must be listed in `vars`.         |
| `secret`     | yes      | The Worker secret that carries the secret key. It must be listed in `secrets`. |

Setup creates the widget when none has this name or covers these domains, stores its secret key on
the Worker, and prints the site key to put in the wrangler config's `vars`.

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
through the one identity provider, then stores the team domain and the new audience tag on the
Worker. The check fails when the application does not protect a declared path, has another session
length, offers another identity provider, lacks an allow policy for the declared people, or has an
allow policy that lets everyone in. Turning on Zero Trust and connecting Google Workspace have no
API, so setup shows the dashboard steps for them.

## `email`

| Field          | Required | Meaning                                                                                |
| -------------- | -------- | -------------------------------------------------------------------------------------- |
| `domain`       | yes      | The domain in the From address.                                                        |
| `provider`     | yes      | `resend`. The provider decides which DNS records are checked.                          |
| `region`       | no       | The provider's sending region. Defaults to `us-east-1`.                                |
| `apiKeySecret` | no       | The Worker secret that carries the provider's API key. It must be listed in `secrets`. |

For Resend, the check looks up the `send` MX and SPF records and the `resend._domainkey` DKIM
record, which production needs, and the `_dmarc` record, which it recommends. It uses public DNS, so
it needs no credential.

## `secrets`

| Field         | Required | Meaning                                                                                                                              |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `name`        | yes      | The name in capitals, such as `RESEND_API_KEY`.                                                                                      |
| `purpose`     | yes      | What production uses it for, in one sentence.                                                                                        |
| `use`         | no       | `live` (the default): production is not ready without it. `future`: only a feature that is not built yet needs it, so it only warns. |
| `neededFor`   | no       | The feature that does not work without it, as a phrase that follows "needed for".                                                    |
| `targets`     | no       | Where it is stored: `worker`, or `github:<environment>`. Defaults to `worker`.                                                       |
| `url`         | no       | The page to open first. Setup offers to open it.                                                                                     |
| `steps`       | no       | Numbered, click-by-click steps to find or create the value, each one complete sentence.                                              |
| `generate`    | no       | `true` when setup should mint a random value (32 random bytes) instead of asking.                                                    |
| `from`        | no       | `cloudflare.accountId` to copy the manifest's account ID.                                                                            |
| `pattern`     | no       | A regular expression a pasted value must match.                                                                                      |
| `patternHint` | no       | What a valid value looks like, shown when a pasted value does not match.                                                             |

A secret gets its value from exactly one place: `generate`, `from`, a Turnstile widget or Access
application that names it, or a person. A secret a person types in must have `steps`, so the person
is never left guessing where the value comes from. Setup can see only whether a secret exists, never
its value, so it cannot tell a stale value from a current one; a resource created during a run
always stores its new value.

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
