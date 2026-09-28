# Set up the standard bot

The `Publish standard` and `Standard status` workflows act on every repository in the organization.
They authenticate as a GitHub App called the LVBT standard bot, not as a person. The App's key never
expires and is not tied to anyone's account. Pull requests it opens also run the `Validate` check;
pull requests opened with a workflow's own `GITHUB_TOKEN` would not.

You need to be an owner of the `LasVegasForTransit` organization. The setup takes about ten minutes,
and you do it once.

## 1. Create the App

1. Open <https://github.com/organizations/LasVegasForTransit/settings/apps/new>.
2. Fill in the form with exactly these values:

   | Field            | Value                                                      |
   | ---------------- | ---------------------------------------------------------- |
   | GitHub App name  | `LVBT standard bot`                                        |
   | Homepage URL     | `https://github.com/LasVegasForTransit/repository-tooling` |
   | Webhook → Active | Unchecked                                                  |

3. Under **Permissions → Repository permissions**, set these and leave everything else at **No
   access**:

   | Permission      | Access                        |
   | --------------- | ----------------------------- |
   | Administration  | Read-only                     |
   | Checks          | Read-only                     |
   | Commit statuses | Read-only                     |
   | Contents        | Read and write                |
   | Metadata        | Read-only (set automatically) |
   | Pull requests   | Read and write                |
   | Workflows       | Read and write                |

4. Under **Where can this GitHub App be installed?**, choose **Only on this account**.
5. Select **Create GitHub App**.

## 2. Save its credentials

1. On the App's page, copy the **Client ID**. It starts with `Iv`.
2. Scroll to **Private keys** and select **Generate a private key**. Your browser downloads a `.pem`
   file.

## 3. Install it on every repository

1. In the App's left sidebar, select **Install App**.
2. Next to `LasVegasForTransit`, select **Install**.
3. Choose **All repositories** and select **Install**.

## 4. Give the credentials to repository-tooling

Run these two commands from any directory, replacing the Client ID and the path to the downloaded
file:

```bash
gh variable set LVBT_BOT_CLIENT_ID --repo LasVegasForTransit/repository-tooling --body Iv23liExample
```

```bash
gh secret set LVBT_BOT_PRIVATE_KEY --repo LasVegasForTransit/repository-tooling < ~/Downloads/lvbt-standard-bot.private-key.pem
```

Then delete the downloaded `.pem` file. GitHub keeps no other copy; if it is lost, generate a new
key on the App's page and run the second command again.

## 5. Check that it works

1. Open **Actions → Standard status** in repository-tooling and select **Run workflow**. The job
   summary lists every repository with its release. A red run with findings is expected until every
   repository is current; a run that fails before the table appears means the credentials are wrong.
2. Open **Actions → Publish standard** and select **Run workflow** with both boxes empty. Every
   repository that is behind the latest release gets one pull request titled
   `chore: update LVBT repository standard to <tag>`, with auto-merge turned on.

Running either workflow a second time changes nothing that is already current.

## 6. Retire the old token

The template repositories used to be updated with a personal access token stored as
`TEMPLATE_PUBLISH_TOKEN`. Once step 5 works, delete that secret and revoke the token:

```bash
gh secret delete TEMPLATE_PUBLISH_TOKEN --repo LasVegasForTransit/repository-tooling
```

Then open <https://github.com/settings/personal-access-tokens>, find the token that had access to
the three template repositories, and select **Delete**.
