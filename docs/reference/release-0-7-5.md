# Repository tooling 0.7.5

Release configuration can select a separate publication mode for production. This lets a repository
keep its existing version-based pull request previews while production promotion verifies the same
retained artifact on the protected named staging Worker. The generated production Worker config
disables version URLs in this mode, and the shared publisher deploys the retained bytes after
staging acceptance.

Set `release.productionPublicationMode` to `named-staging` and pass
`publication-mode: named-staging` to the shared production publisher. Existing configurations keep
their current behavior when this field is omitted. The release configuration schema and migration
checks validate the selected mode before provider writes.

All shared package and example references advance to 0.7.5. Applications can adopt the reviewed
source commit with the standard updater; publishing or tagging remains a separate maintainer action.
