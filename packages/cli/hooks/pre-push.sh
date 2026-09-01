#!/usr/bin/env sh
# Runs the same check CI runs before anything leaves the laptop, so a red CI
# run is rare rather than routine. CI is still the authority.
set -eu
cd "$(git rev-parse --show-toplevel)"
pnpm check
