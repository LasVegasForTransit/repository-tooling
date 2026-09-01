#!/usr/bin/env node
// Bootstrap entry for a repository that has nothing installed yet:
//   npx --yes github:LasVegasForTransit/repository-tooling#v0.2.0 init --profile package --scopes ...
// Delegates to the same generator consumers get as @lvbt/repository-tooling.
import '../packages/repository-tooling/src/cli.mjs';
