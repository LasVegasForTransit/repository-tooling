# Repository standard v0.7.9

Agents in every adopting repository follow the same versioned resource policy. The canonical text is
[the agent resource policy](../../standards/agent-resource-policy.md); the preset vendors that text
with its existing commit and content hash. The updater installs an exact local copy in
`.lvbt/agent-resource-policy.md` and adds a visible reference to root `AGENTS.md` and existing
`CLAUDE.md`. All other project instructions remain intact. Examples carry identical checked copies;
template publication and daily `Standard update` use the existing rollout mechanism.

The policy requires local tests by default, bounded shared-service work, per-project and account
budgets, explicit review of schedules, preview jobs off unless required, protection of production
and backup capacity, and measured deployed recovery before claiming resource fixes complete. It also
covers CI ownership and cost, dependency reuse, and cleanup that preserves dirty and unmerged work.

`lvbt check`, `standards:check` and the organization standards inventory warn when a policy or its
reference is missing or divergent. The bundle integrity check still protects the canonical vendored
text. This new rule is warning-only, including during v0.8 adoption; enabling a failure requires a
later minor release with release notes. Existing checks keep their current severity.

Do not publish or tag this release without maintainer approval. Do not hand-copy divergent consumer
rules or overwrite an existing update branch. Transit-mapper's open v0.7.8 update (#182) remains
separate; after approval and publication, the existing updater handles the next release normally. No
billing changes, credential expansion, production migrations or deployments are part of this policy
rollout.
