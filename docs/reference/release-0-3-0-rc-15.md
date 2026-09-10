# Web platform 0.3.0-rc.15

This candidate clears repository-local Git environment variables without an unquoted command
substitution. The shared pre-push hook now passes ShellCheck while preserving the clean environment
required for consumer checks.

Repository tests run ShellCheck across every shared and source hook when the executable is present.
It retains rc14's consumer-root `lint-staged` configuration.
