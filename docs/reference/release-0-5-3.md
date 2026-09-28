# Repository tooling 0.5.3

A repository that stores files with Git LFS no longer needs its own step in `.githooks/pre-push`.
The shared pre-push hook now uploads LFS objects with the push, as the hook `git lfs install` writes
would, once `pnpm check` passes. It does this only when `git-lfs` is installed and `.gitattributes`
has a `filter=lfs` rule, so nothing changes for a repository that doesn't use LFS.

If you added `git lfs pre-push` to your repository's `.githooks/pre-push`, remove it after updating;
the file then matches the standard's copy again and `pnpm standards:check` stops warning about it.
