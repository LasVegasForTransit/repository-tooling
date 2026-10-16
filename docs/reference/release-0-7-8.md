# Repository tooling 0.7.8

Canonical Worker configurations can declare private Worker service bindings with
`bindings.worker({ worker: 'jobs' })` from `cf/config`. The release tooling retains these bindings
in generated Wrangler configurations and saved artifacts from both typed source and compiled
Cloudflare output. An optional `exportName` selects the service's named entrypoint.

Declare each service again in `release.previewBindings` using
`{ "type": "worker", "worker": "jobs-preview" }`. Preview must target a different Worker and retain
the production entrypoint, if one is selected. Missing declarations, shared production targets,
changed binding types, and changed entrypoints fail before packaging. Unsupported binding settings
continue to fail closed. Preview services cannot target the production release Worker or any Worker
used by a production service or Durable Object binding, even under another binding name.

All shared package versions, example dependency pins, and contribution plugin references advance to
0.7.8. This release adds configuration and artifact support; it does not deploy a target Worker or
change its public exposure. Deploy the private target Worker before publishing a caller that binds
to it.
