# Repository tooling 0.7.3

Automatic template updates now restore installed dependencies before committing through the real
shared Git hooks. Template regeneration removes `node_modules`; generating only the lockfile left
the hook without the CLI package and prevented all three templates from opening their update pull
requests.

The incoming template publication entry point also repairs already-installed v0.7.1 and v0.7.2
update drivers, which share the same template update implementation. It preserves the published
lockfile and installs the generated dependencies. Current drivers explicitly delegate installation
once, and an explicit `install: false` still performs no install. The pure template materialization
API continues to generate files without installing packages. When an update must leave workflow
files for a maintainer, its diagnostic preserves each exact repository path, including the first
modified workflow's opening dot.

All seven packages, root and example references, and contribution plugin metadata advance together.
Reusable workflow and attestation signer pins remain the reviewed merged v0.7.0 source commit. No
hook is bypassed or copied into a consumer. Release verification and production promotion gates are
unchanged.

Adopt this patch through the standard updater. The regression exercises both the actual published
v0.7.2 updater and the current caller against basic, Astro and Vite React templates. It regenerates
each template, runs its real formatting and filename hooks, commits normally, and proves the
resulting lockfile supports a frozen install.
