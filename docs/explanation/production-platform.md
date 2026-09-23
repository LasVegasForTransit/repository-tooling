# Why production is declared in a platform manifest

Every LVBT repository that runs a Worker needs the same kinds of things in production: a database
with its migrations applied, a bucket, a bot check, a sign-in in front of the admin pages, an email
domain, secrets, and deploy credentials. Before this existed, each repository kept that knowledge in
comments inside `wrangler.jsonc`, in TODO notes, and in one bespoke bootstrap script. A volunteer
picking up production had to find all of it, and nothing told them when it was complete. This page
explains how the standard replaces that.

## One file says what production needs

The repository declares production in `platform.json`: every resource, every secret with its purpose
and the steps to find it, and every value that must never be there. The file holds names and
instructions, never values, so it is safe to commit and review like code. Because it is data, the
standard can check it, report on it, and act on it the same way in every repository.

## Checking and fixing share one plan

`pnpm preflight --production` and `pnpm bootstrap --production` read the same manifest and the same
live state, and produce the same list of items with the same statuses. The check prints the list.
Setup prints it too, then acts on each open item. Keeping one plan means the report can never claim
something that setup would not do, and it means the planning, the part with the decisions, is tested
without touching a network.

Setup keeps no record of its own progress. Each run starts by reading what actually exists, so it
resumes exactly where the last run stopped, after a skipped question, a failed step, or a change
someone made in a dashboard.

## Credentials stay where they already are

Reading uses what a maintainer already has: Wrangler's sign-in for Workers, D1, and R2, `gh` for
GitHub, and public DNS for email records. Only Turnstile and Access need more, because Wrangler's
sign-in cannot manage them. For those, setup asks for a short-lived API token through a link that
pre-selects the permissions, keeps it in memory, and never writes it anywhere. Secret values follow
the same rule: they travel to Wrangler and `gh` on standard input, never as arguments, and are never
printed.

## Some things stay manual on purpose

Setup never edits `wrangler.jsonc`. A var such as a Turnstile site key belongs in the reviewed
config, because a deploy replaces every var with what the config says; setup prints the exact line
to add instead. Turning on Zero Trust, connecting Google Workspace, and verifying an email domain
have no API, so setup prints numbered dashboard steps and waits. Deleting a forbidden secret is
offered, never done without asking.

## Where the design came from

The website's bespoke bootstrap proved the ideas: a list of secrets with a purpose, a link, and
click-by-click steps; values the tool can mint itself; a read-only doctor mode; and grouping by
whether a live feature is waiting. The standard generalizes those into a schema and one command
every repository shares, so the next repository gets them by writing a manifest rather than a
script.
