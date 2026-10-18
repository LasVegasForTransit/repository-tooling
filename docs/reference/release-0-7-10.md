# Repository tooling 0.7.10

Named production promotions can resume an activation-only failed-job retry with the exact immutable
candidate proof from the successful earlier attempt. The candidate job exports its artifact ID;
activation no longer looks for an artifact named after the retry's attempt. A missing or invalid
reference stops before downloading proof.

Proof validation checks the producing attempt's successful candidate job and immutable receipt
bytes. The run, selected release, app, tools revisions, preview namespace, and acceptance outcomes
remain bound, and future attempts or cross-run proof are rejected. Current production-version checks
remain in place before migrations and activation. The operator guide explains when to retry failed
jobs, when to rerun candidate verification, and when production needs reconciliation.

Adopt the matching tooling package and reusable publisher workflow together. This release retains
the separate migration credential behavior from 0.7.9. All shared package versions, example
dependency pins, and contribution plugin references advance to 0.7.10.
