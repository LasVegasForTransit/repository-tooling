# Web platform 0.3.0-rc.14

This candidate pins pre-commit formatting to the consumer repository's root `lint-staged`
configuration. Staging a standards update no longer activates configuration files contained inside
the immutable vendor tree.

It retains rc13's formatting exclusion for `.lvbt/web-platform/` during full repository checks.
