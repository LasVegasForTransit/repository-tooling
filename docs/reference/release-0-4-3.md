# Repository tooling 0.4.3

`pnpm bootstrap --production` can now be run again at any time without changing anything that is
already set up. On a finished setup it says "Nothing was changed" and exits 0. A repository that
updates needs no change of its own.

Several steps could act twice before. Cloudflare lists were read only as far as their first page, or
not at all past it, so a D1 database, Turnstile widget, Access application, or allow policy on a
later page looked missing and setup tried to create it again; an R2 bucket past the first page of
the bucket list did too. Setup now reads every page, looks each bucket up by name, and stops rather
than guess when a list cannot be read to the end. Creating an Access application no longer stores
the team domain again when it is already set. Fixing an application that let everyone in now
detaches that policy, so the next run does not find the same problem and fix it again. Widening a
Turnstile widget keeps the widget's other settings. A generated secret that is set on one target but
missing from another is reported instead of generated again, because a second random value would
leave the targets disagreeing. Migrations for a database created in the same run wait until the
wrangler config names its `database_id`, since Wrangler applies them to the database the config
names.

Replacing a stored value is now an explicit choice:
`pnpm bootstrap --production --rotate SIGNING_SECRET` stores a new random value for a generated
secret, asks again for a typed one, or copies again from the Turnstile widget or Access application
that feeds it, on every target the secret lists, after asking. Without `--rotate`, a secret that is
set is never asked for, generated, or copied again.

Every dashboard step setup prints now assumes the person has never used the service. The steps say
what to type in each field, where each copied value goes, and what it looks like, and they follow
the current Cloudflare One, Google Auth Platform, Turnstile, and Resend screens. They use LVBT's
real team domain, `lvbt.cloudflareaccess.com`, and keep it apart from the team name. When Cloudflare
One is already on, the report shows the team domain and team name and skips the first-time steps.
Each value setup asks for now says whether it is fine to skip. The
[set-up guide](../how-to/set-up-production.md#what-to-enter-in-each-dashboard) has the same steps
for every service, including the deploy token, the Resend API key, and the Cloudflare Web Analytics
token, so a manifest can copy them into its own `steps`.

An Access application that admits a Google Group now gets a guided step to create the group first,
with how to add and remove people later. Setup cannot read Google Groups, so it asks whether the
group exists and remembers a yes on that computer, in `~/.config/lvbt/confirmations.json`; until
then, the group is reported as a warning, so an unattended check still passes. The Access steps now
follow the "Create new self-hosted application" page from top to bottom and use exactly the names in
`platform.json`, so setup recognizes an application or widget someone made by hand. The check also
reports an application that accepts every identity provider rather than only the declared one, and
setup fixes it.
