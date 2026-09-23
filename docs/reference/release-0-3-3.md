# Repository tooling 0.3.3

The Cloudflare doctor checks a Worker custom domain through its domain binding and managed
certificate. It no longer requires a separate A, AAAA, or CNAME record for Worker-managed DNS.

An independently owned Worker can declare `previewRequired: false` when version preview URLs are
incompatible with its stateful runtime. Route and Worker existence checks still apply.
