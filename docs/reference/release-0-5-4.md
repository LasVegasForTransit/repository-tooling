# Repository tooling 0.5.4

Nothing changes in how your repository works. In a repository with a merge queue, the
`Standard update` pull request for a patch release now enters the queue by itself. Before, it asked
for a rebase auto-merge, which GitHub records but never adds to the queue, so someone had to queue
it by hand.
