# Set up a repository's production platform

This guide takes a repository from "the code is ready" to "production has everything it needs": its
database and bucket, bot check, admin sign-in, email, secrets, and deploy credentials. You declare
those things once in a `platform.json` file, then one command checks them and another sets up
whatever is missing. Run the same two commands again at any time to confirm production is still
complete.

## Before you start

- `pnpm bootstrap` passes on your machine. That means Node.js, pnpm, the GitHub CLI (signed in with
  `gh auth login`), and Wrangler (signed in with `pnpm exec wrangler login`) all work.
- Your Cloudflare user can administer the LVBT account, including Zero Trust.
- Your GitHub user is an admin of the repository, so it can create environments and their secrets.
- For email, you can sign in to the LVBT Resend account.
- For admin sign-in through Google Workspace the first time in an account, a Google Workspace admin
  is at hand. After that, every repository reuses the same connection.

## 1. Declare what production needs

If the repository already has a `platform.json` next to its production `wrangler.jsonc`, skip to
step 2. Otherwise create `apps/<app>/platform.json` (or `platform.json` at the root of a single-app
repository), starting from the example in the
[platform manifest reference](../reference/platform-manifest.md). List every binding the Worker
reads from `env`: the D1 databases and R2 buckets, each secret with its purpose and the steps to
find it, the vars, any Turnstile widget and Access application, the email domain, and the GitHub
environment secrets the deploy workflow uses. Add every preview-only value to `forbidden`.

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

- **A Cloudflare API token for Turnstile and Access.** Wrangler's sign-in cannot manage these, so
  the command prints a link that opens Cloudflare's token page with the permissions already chosen,
  and numbered steps. Set the token to expire tomorrow, create it, and paste it. The token stays in
  the terminal's memory and is never saved. Press Enter instead to leave Turnstile and Access for
  later.
- **Secret values.** For each value it cannot make itself, the command shows what the value is for,
  the page to open, and numbered steps. It offers to open the page. Paste the value when asked; it
  does not appear on screen. A value that does not look right is asked for again. Press Enter to
  skip one for now.
- **Dashboard steps.** A few things have no API: turning on Zero Trust, connecting Google Workspace
  as the sign-in, and verifying the email domain in Resend. For those, the command prints the steps,
  offers to open the page, and waits for you to press Enter.
- **Features not built yet.** Before it starts, the command asks whether to also set the values that
  only such features need. The default is to leave them for later.

Everything else happens without questions: databases, buckets, and migrations; the Turnstile widget
and the Access application with its allow policy; generated secrets; the GitHub environment; and
values the command already knows, such as the account ID. When it finds a value that must not be in
production, it offers to delete it.

The run ends with a fresh report. If something is still open, finish the step it names and run
`pnpm bootstrap --production` again. It starts from what exists each time, so it picks up exactly
where you stopped.

## 4. Commit the config changes it asks for

The command never edits the wrangler config, because a config change should be reviewed. When the
report says a var is missing, such as the Turnstile site key, or a `database_id` differs, it prints
the exact line to change. Make that change on a branch, open a pull request, and merge it. The next
deploy from `main` carries it.

## 5. Confirm production is ready

```bash
pnpm preflight --production
```

The last line should read `Ready for production.` Delete the Cloudflare token you created in step 3
at <https://dash.cloudflare.com/profile/api-tokens> if it has not expired yet.

To check production from CI, run the same command with `CLOUDFLARE_API_TOKEN` (for Wrangler),
`GH_TOKEN` (for `gh`), and `LVBT_CLOUDFLARE_SETUP_TOKEN` (a read-only token for Turnstile and
Access) in the environment. It exits 1 when production is not ready.

## When something goes wrong

| What you see                                             | What to do                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `could not check: Wrangler has no credential`            | Run `pnpm exec wrangler login`, then the command again.                                          |
| Turnstile or Access says `403` or `Authentication error` | The token lacks a permission. Create a new one from the link; check every permission it lists.   |
| `Zero Trust is not turned on for this account`           | Follow the steps setup shows, then run it again. Access items wait until it is on.               |
| `does not bind DB to …` or a `database_id` mismatch      | Edit the wrangler config as the `next:` line says, through a pull request.                       |
| An email record stays missing after Resend says Verified | DNS can take a few minutes to spread. Run the check again later.                                 |
| `bootstrap --production … needs a terminal`              | Run it in a terminal, not through CI or a pipe. Use `pnpm preflight --production` to only check. |
