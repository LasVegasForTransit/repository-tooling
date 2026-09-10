# Web platform 0.3.0-rc.13

This candidate excludes the immutable `.lvbt/web-platform/` tree from repository formatting in every
project template. Vite and other non-Astro repositories no longer need Astro's Prettier plugin
merely because the vendored preset contains an Astro example.

The preset integrity check continues to verify every vendored byte independently of formatting.
