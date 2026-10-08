# Repository tooling 0.7.1

This patch corrects the immutable reusable workflow and attestation signer pins in generated
repositories. Use the actual merged v0.7.0 source commit rather than the reviewed PR commit that was
rewritten by the required rebase merge. GitHub Actions cannot resolve the latter after its branch is
deleted.

All seven shared packages and the generated templates advance together. The workflow implementations
are identical to the reviewed v0.7.0 merged tree; existing command, security, audit and release
contracts are unchanged.

Consumers should adopt v0.7.1 with the standard updater and set their shared workflow and signer
pins to `3567f0cb1345e8756eb5d84e0a3ea7b62695125a`. A regression check requires generated workflow
pins to belong to the published merged release history. Validate Actions using the exact merged
source before closing a migration.

CI setup also installs the reviewed Gitleaks 8.30.1 native scanner from the official release using a
pinned archive checksum. Required secret scanning no longer depends on a runner's Docker daemon
being available. Installation fails before extraction when the checksum is wrong; the scan still
requires full Git history. The contribution marketplace version now agrees with both plugin
manifests.
