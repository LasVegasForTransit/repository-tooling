# Set up a repository's production platform

This guide takes a repository from "the code is ready" to "production has everything it needs": its
database and bucket, bot check, admin sign-in, email, secrets, and deploy credentials. You declare
those things once in a `platform.json` file, then one command checks them and another sets up
whatever is missing. Run the same two commands again at any time. On a finished setup they change
nothing and say so.

## Before you start

- `pnpm bootstrap` passes on your machine. That means Node.js, pnpm, the GitHub CLI (signed in with
  `gh auth login`), and Wrangler (signed in with `pnpm exec wrangler login`) all work.
- Your Cloudflare user can administer the LVBT account (ID `2557b5c2e166292ded0f8425b73075e9`),
  including Cloudflare One, which Cloudflare used to call Zero Trust.
- Your GitHub user is an admin of the repository, so it can create environments and their secrets.
- For email, you can sign in to the LVBT Resend account.
- For admin sign-in through Google Workspace the first time in an account, a Google Workspace super
  admin for lasvegasfortransit.org is at hand. After that, every repository reuses the same
  connection. LVBT's is already connected.

## 1. Declare what production needs

If the repository already has a `platform.json` next to its production `wrangler.jsonc`, skip to
step 2. Otherwise create `apps/<app>/platform.json` (or `platform.json` at the root of a single-app
repository), starting from the example in the
[platform manifest reference](../reference/platform-manifest.md). List every binding the Worker
reads from `env`: the D1 databases and R2 buckets, each secret with its purpose and the steps to
find it, the vars, any Turnstile widget and Access application, the email domain, and the GitHub
environment secrets the deploy workflow uses. Add every preview-only value to `forbidden`.

For a secret a person types in, such as the Resend key or the deploy token, copy the steps from
[What to enter in each dashboard](#what-to-enter-in-each-dashboard) below, so the person running
setup is never left guessing.

Then run the repository check, which validates the file:

```bash
pnpm check
```

A mistake prints the field and what is wrong with it, such as
`$.secrets[0].name: "resend-key" does not match ^[A-Z][A-Z0-9_]*$`. Commit the file with the change
that needs it.

## 2. See what production is missing

```bash
pnpm preflight --production
```

After the machine checks, this prints one line per item, grouped by section, and changes nothing:

```text
lvwwd.org production (apps/site/platform.json)

D1 databases
  ok    lvwwd                   exists and is bound as DB
  ok    lvwwd migrations        all 4 applied

Secrets
  FAIL  RESEND_API_KEY → Worker lvwwd   is not set; needed for emailing "Open my week" links
                                        next: pnpm bootstrap --production asks for it, with steps

Not ready for production. 10 of 25 ready, 13 needed now, 2 recommended.
```

`FAIL` means production needs the item now. `WARN` means only a feature that is not built yet needs
it, or it is recommended. The `next:` line under each one says what fixes it. If a line says "could
not check", read its reason: usually a sign-in has expired (`pnpm exec wrangler login` or
`gh auth login`), or it needs the Cloudflare token that step 3 asks for.

## 3. Set up what is missing

```bash
pnpm bootstrap --production
```

It installs, runs the machine checks, prints the same report, lists what it is about to do, and asks
once before it starts. Answer the questions as they come:

- **A Cloudflare API token for Turnstile and Access.** Wrangler's sign-in cannot read or manage
  these, so the command prints a link that opens Cloudflare's token page with the permissions
  already chosen, and numbered steps. It asks on every run, even when everything is set up, because
  it cannot check Turnstile and Access without it. The token stays in the terminal's memory and is
  never saved. Press Enter instead to leave Turnstile and Access unchecked for now.
- **Secret values.** For each value it cannot make itself, the command says in one sentence what the
  value is for, whether it is fine to skip, the page to open, and numbered steps. It offers to open
  the page. Paste the value when asked; it does not appear on screen. A value that does not look
  right is asked for again. Press Enter to skip one for now.
- **Dashboard steps.** A few things have no API: turning on Cloudflare One the first time,
  connecting Google Workspace as the sign-in, and verifying the email domain in Resend. For those,
  the command prints the steps, offers to open the page, and waits for you to press Enter. When
  Cloudflare One is already on, as it is for LVBT, the command only confirms the team domain
  (`lvbt.cloudflareaccess.com`) and moves on.
- **Features not built yet.** Before it starts, the command asks whether to also set the values that
  only such features need. The default is to leave them for later.

Everything else happens without questions: databases, buckets, and migrations; the Turnstile widget
and the Access application with its allow policy; generated secrets; the GitHub environment; and
values the command already knows, such as the account ID or the team domain. When it finds a value
that must not be in production, it offers to delete it.

The run ends with a fresh report. If something is still open, finish the step it names and run
`pnpm bootstrap --production` again. It starts from what exists each time, so it picks up exactly
where you stopped.

## 4. Commit the config changes it asks for

The command never edits the wrangler config, because a config change should be reviewed. When the
report says a var is missing, such as the Turnstile site key, or a `database_id` differs, it prints
the exact line to change. Make that change on a branch, open a pull request, and merge it. The next
deploy from `main` carries it. A database the command created in this run gets its migrations on the
next run, once the config names its `database_id`.

## 5. Confirm production is ready

```bash
pnpm preflight --production
```

The last line should read `Ready for production.` Delete the Cloudflare token you created in step 3
at <https://dash.cloudflare.com/profile/api-tokens> if it has not expired yet.

To check production from CI, run the same command with `CLOUDFLARE_API_TOKEN` (for Wrangler),
`GH_TOKEN` (for `gh`), and `LVBT_CLOUDFLARE_SETUP_TOKEN` (a read-only token for Turnstile and
Access) in the environment. It exits 1 when production is not ready.

## Running it again, and replacing a value

`pnpm bootstrap --production` is safe to run as often as you like. Each step checks before it acts:

- A database, bucket, widget, Access application, allow policy, or GitHub environment that exists is
  found by name and left alone. It is never created twice.
- A secret that is already set is never asked for, generated, or copied again, even if you would
  type a different value. Setup can see only a secret's name, never its value.
- Migrations that are already applied are skipped.
- The wrangler config is never rewritten.

On a finished setup, the command prints "Nothing was changed" and exits 0.

To replace a secret on purpose, for example after a leak, name it with `--rotate`:

```bash
pnpm bootstrap --production --rotate SIGNING_SECRET
```

The command asks before it replaces anything. A generated secret gets a new random value, a secret a
person types is asked for again, and a secret a Turnstile widget or Access application feeds is
copied from it again. The new value is stored on every target the secret lists. To replace the
Turnstile secret itself, first rotate it in the dashboard (the widget's Settings, then "Rotate
Secret Key"), then run the command with `--rotate TURNSTILE_SECRET`.

If a generated secret is set on one target but missing from another, the report says so instead of
generating a second value, because the two would then disagree. `--rotate` fixes it by storing one
new value everywhere.

## What to enter in each dashboard

The command prints these steps when it needs them. They are here too, so you can read them ahead or
follow them without the command. Each one assumes you have never used the service before.

### Cloudflare One (Zero Trust), the first time

Cloudflare One is already on for the LVBT account, so you only need this for a new account. Its team
domain is `lvbt.cloudflareaccess.com`, and its team name is "Las Vegans for Better Transit". Keep
the two apart: the team domain is the address of the sign-in page and the value every
`ACCESS_TEAM_DOMAIN` secret holds, while the team name is only a label people see.

1. Open <https://one.dash.cloudflare.com/> and choose the LVBT account.
2. When Cloudflare asks you to choose the team domain (its documentation calls this the team name),
   type `lvbt`. The team domain becomes `lvbt.cloudflareaccess.com`.
3. If it also asks for a team name, type `Las Vegans for Better Transit`. It changes nothing in any
   configuration.
4. Choose the Zero Trust Free plan. Cloudflare asks for payment details even for the Free plan, but
   does not charge for it.
5. Finish the onboarding.

To find both later, open Cloudflare One, then Overview, then Account details. It shows the Team
domain and the Team name, each with a pencil icon that edits it. Do not change the team domain: the
admin sign-in and the Google sign-in stop working until every `ACCESS_TEAM_DOMAIN` secret and the
Google OAuth client below are updated to match.

### Google Workspace as the sign-in

A Google Workspace super admin for lasvegasfortransit.org should do the Google steps, because
turning on "Trust internal apps" and approving group access both need one. The Cloudflare steps need
a Cloudflare user who can administer the LVBT account.

1. Open <https://console.cloud.google.com/> and use the project picker at the top to choose the
   project "LVBT Access". If there is none, click "New project", name it `LVBT Access`, keep the
   organization, and click "Create".
2. Open <https://console.cloud.google.com/apis/library/admin.googleapis.com> and click "Enable" on
   "Admin SDK API". Access uses it to read which Google Groups a person is in.
3. Open <https://console.cloud.google.com/auth/overview>. If Google says the app is not configured,
   click "Get started". Enter the app name `LVBT volunteer sign-in` and your @lasvegasfortransit.org
   address as the support email, choose the audience "Internal", enter your address as the contact
   email, agree to the policy, and click "Create".
4. Open <https://console.cloud.google.com/auth/clients> and click "Create client". Choose the
   application type "Web application" and name it `Cloudflare Access`.
5. Under "Authorized JavaScript origins", click "Add URI" and enter exactly
   `https://lvbt.cloudflareaccess.com`.
6. Under "Authorized redirect URIs", click "Add URI" and enter exactly
   `https://lvbt.cloudflareaccess.com/cdn-cgi/access/callback`. Click "Create".
7. Copy the Client ID, which ends in `.apps.googleusercontent.com`, and the Client secret. They go
   into Cloudflare One in step 9, not into GitHub or a Worker.
8. Open <https://admin.google.com/ac/owl> (Security, then Access and data control, then API
   controls), click "Settings", turn on "Trust internal apps", and save. It is off by default, and
   Access needs it.
9. In Cloudflare One, go to Integrations, then Identity providers, and click "Add new identity
   provider", then "Google Workspace". Paste the Client ID into "App ID" and the Client secret into
   "Client secret", type `lasvegasfortransit.org` as the Google Workspace domain, and click "Save".
10. Cloudflare shows a link. Open it signed in as the Google Workspace super admin and approve it,
    so Access can read group membership.
11. Back in Identity providers, click "Test" next to Google Workspace. It should show your name and
    your groups.

### An Access application

`pnpm bootstrap --production` creates the application when it has the Cloudflare token. To create it
by hand instead, for example for lvwwd.org's volunteer admin pages:

1. Open <https://one.dash.cloudflare.com/> with the LVBT account and go to Access controls, then
   Applications. If the application is already listed, skip to step 9.
2. Click "Create new application" (some screens say "Add an application").
3. In the "Add an application" dialog, on the "Self-hosted and private" tab, choose "Public DNS",
   then click "Continue with Self-hosted and private".
4. Name the application, for example `lvwwd.org volunteer admin`.
5. Click "Add public hostname" once for each address. For lvwwd.org, leave Subdomain empty, choose
   `lvwwd.org` in the Domain dropdown, and type the path `admin`. Add two more the same way with the
   paths `admin/*` and `api/admin/*`. A path does not cover the paths under it, and a wildcard does
   not cover its parent, so all three are needed.
6. Under "Access policies", create a new policy named after the application with `allow` at the end,
   with the action "Allow".
7. Add one Include rule. Open Integrations, then Identity providers, in Cloudflare One: if it lists
   Google Workspace (it does for LVBT), choose the selector "Google Workspace groups" and enter the
   group, `wwd-admin@lasvegasfortransit.org` for lvwwd.org. If it does not, choose "Emails ending
   in" and enter `@lasvegasfortransit.org`.
8. Under login methods, select only "Google Workspace" (or "One-time PIN" without it) and turn on
   "Apply instant authentication". Set "Session Duration" to 24 hours and click "Create".
9. To copy the audience tag, click "Configure" on the application, open "Additional settings", and
   copy "Application Audience (AUD) Tag". It is 64 lowercase letters and digits, and it is the value
   of `ACCESS_AUD`.

### A Turnstile widget

1. Open <https://dash.cloudflare.com/2557b5c2e166292ded0f8425b73075e9/turnstile>. If a widget with
   the site's name is listed, click it and skip to step 5.
2. Click "Add widget" and type the widget name, which is the site, such as `lvwwd.org`.
3. Under "Hostname management", add the site's hostname.
4. Choose the widget mode "Managed", leave pre-clearance off, and click "Create".
5. Copy the Site Key. It is public and starts with `0x`. It goes into `"vars"` in the production
   wrangler config as `TURNSTILE_SITE_KEY`, through a pull request.
6. Copy the Secret Key. It is private and also starts with `0x`. It is the Worker secret
   `TURNSTILE_SECRET`, which setup stores.

### The Cloudflare API tokens

Setup uses a short-lived token that it never saves, and the deploy workflow uses a long-lived one
stored in GitHub.

The setup token lets `pnpm bootstrap --production` read and create Turnstile widgets and Access
applications:

1. Open the link the command prints. It opens "Create Custom Token" at
   <https://dash.cloudflare.com/profile/api-tokens> with the permissions filled in.
2. Name it `lvbt setup <site>`.
3. Check that "Permissions" has exactly these three rows, each set to "Account": "Turnstile" with
   "Edit", "Access: Apps and Policies" with "Edit", and "Access: Organizations, Identity Providers,
   and Groups" with "Read". Add any that is missing with "+ Add more".
4. Under "Account Resources", choose "Include" and the LVBT account, not "All accounts".
5. Under "TTL", set the end date to tomorrow.
6. Click "Continue to summary", then "Create Token", then "Copy". Cloudflare shows it only once.
   Paste it into the terminal, and delete it when you finish.

The deploy token lets the Deploy workflow publish the Worker. It becomes the GitHub environment
secret `CLOUDFLARE_API_TOKEN` in the `production` environment:

1. Open <https://dash.cloudflare.com/profile/api-tokens> and click "Create Token".
2. Next to "Edit Cloudflare Workers", click "Use template". The template grants, for the account:
   Workers Scripts, Workers KV Storage, and Workers R2 Storage with "Edit", and Workers Tail and
   Account Settings with "Read"; for the zone: Workers Routes with "Edit"; and for the user: User
   Details and Memberships with "Read". It does not include D1. Add the account permission "D1" with
   "Edit" only if the deploy workflow applies migrations.
3. Under "Account Resources", choose "Include" and the LVBT account.
4. Under "Zone Resources", choose "Include", then "Specific zone", then the site's zone, such as
   `lvwwd.org`.
5. Rename the token to `<site> deploy (GitHub Actions)` and leave "TTL" empty, so deploys keep
   working.
6. Click "Continue to summary", then "Create Token", then "Copy". Paste it when setup asks for
   `CLOUDFLARE_API_TOKEN`.

Setup copies `CLOUDFLARE_ACCOUNT_ID` into the same environment by itself.

### Resend

1. Sign in at <https://resend.com/login>. If you have no account, sign up at
   <https://resend.com/signup> with your @lasvegasfortransit.org address, and ask a maintainer to
   invite you to the LVBT team.
2. On the Domains page, click "Add Domain", type the sending domain (lvwwd.org sends from
   `lvwwd.org`), choose the region "North Virginia (us-east-1)", and click "Add". The region must
   match `email.region` in `platform.json`.
3. On the domain's page, click "Sign in to Cloudflare" and approve the request. It adds every DNS
   record for you.
4. To add the records by hand instead, open the zone's DNS records page in the Cloudflare dashboard
   and add each with TTL "Auto" and Proxy status "DNS only": an MX record named `send` with the mail
   server `feedback-smtp.us-east-1.amazonses.com` and priority 10; a TXT record named `send` with
   the content `v=spf1 include:amazonses.com ~all`; and a TXT record named `resend._domainkey` with
   the long `p=` value Resend shows. For a subdomain such as `notify.lasvegasfortransit.org`, add
   the subdomain to each name, as in `send.notify`.
5. Add the DMARC record Resend recommends: a TXT record named `_dmarc` with the content
   `v=DMARC1; p=none;`.
6. Click "Verify DNS Records" and wait until the domain's status says "Verified". It usually takes a
   few minutes; DNS can take up to 72 hours.
7. Open <https://resend.com/api-keys> and click "Create API Key". Name it after the Worker, such as
   `lvwwd.org Worker`, choose the permission "Sending access", choose the verified domain, and click
   "Add".
8. Copy the key. It starts with `re_`, and Resend shows it only once. It is the secret
   `RESEND_API_KEY`.

### Cloudflare Web Analytics

A site that counts visits with Cloudflare Web Analytics needs the site's token at build time. It is
public, so it is a GitHub environment variable, not a secret.

1. Open <https://dash.cloudflare.com/2557b5c2e166292ded0f8425b73075e9/web-analytics> and click "Add
   a site". Type the site's hostname, such as `lvwwd.org`.
2. Choose "Enable with JS Snippet installation", not the automatic option, because the site loads
   the beacon itself.
3. Open "Manage site" to see the JS snippet. Copy only the token inside
   `data-cf-beacon='{"token": "..."}'`.
4. In the GitHub repository, open Settings, then Environments, then `production`. Under "Environment
   variables", click "Add environment variable", name it `PUBLIC_LVBT_CWA_TOKEN`, and paste the
   token.

### GitHub environments

Setup creates a missing environment itself. To create one by hand, open the repository's Settings,
then Environments, then "New environment", type its name (such as `production`), and click
"Configure environment". Add secrets under "Environment secrets" with "Add environment secret", and
variables under "Environment variables" with "Add environment variable". Only repository admins can
configure environments.

## When something goes wrong

| What you see                                               | What to do                                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `could not check: Wrangler has no credential`              | Run `pnpm exec wrangler login`, then the command again.                                                |
| Turnstile or Access says `403` or `Authentication error`   | The token lacks a permission. Create a new one from the link; check every permission it lists.         |
| `Zero Trust is not turned on for this account`             | Follow the first-time steps above, then run it again. Access items wait until it is on.                |
| `does not bind DB to …` or a `database_id` mismatch        | Edit the wrangler config as the `next:` line says, through a pull request.                             |
| Migrations "wait until" the config has a `database_id`     | Put the id the report shows in the wrangler config through a pull request, then run the command again. |
| A secret "is set on … and setup cannot read that value"    | Run `pnpm bootstrap --production --rotate <NAME>` to store one new value everywhere.                   |
| An email record stays missing after Resend says Verified   | DNS can take a few minutes to spread. Run the check again later.                                       |
| `bootstrap --production … needs a terminal`                | Run it in a terminal, not through CI or a pipe. Use `pnpm preflight --production` to only check.       |
| The Google sign-in fails after the team domain was changed | Change it back, or update every `ACCESS_TEAM_DOMAIN` and the Google OAuth client's two addresses.      |
