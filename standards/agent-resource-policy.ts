import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { WebPreset } from './web-platform.ts';
import { readOptional, rejectSymlinkDestination } from './paths.ts';

export const RESOURCE_POLICY_SOURCE = 'standards/agent-resource-policy.md';
export const RESOURCE_POLICY_TARGET = '.lvbt/agent-resource-policy.md';
export const resourcePolicyReference = (
  policyPath = RESOURCE_POLICY_TARGET,
) => `## Shared resource policy

Follow the shared [resource policy](${policyPath}) before running work.

This shared policy supplements the project-specific instructions in this file.
`;
export const RESOURCE_POLICY_REFERENCE = resourcePolicyReference();
const section = /^## Shared resource policy\r?\n[\s\S]*?(?=^## |$(?![\s\S]))/gmu;

function withReference(current: string): string {
  if (current.match(section)?.length) {
    if ((current.match(section)?.length ?? 0) > 1)
      throw new Error('Duplicate Shared resource policy sections; reconcile them before updating.');
    return current.replace(
      section,
      (match, offset: number) =>
        RESOURCE_POLICY_REFERENCE + (offset + match.length < current.length ? '\n' : ''),
    );
  }
  return `${current.trimEnd()}\n\n${RESOURCE_POLICY_REFERENCE}`.trimStart();
}

/** Only the policy and its visible instruction section belong to the shared standard. */
export async function syncResourcePolicy(
  root: string,
  bundle: Pick<WebPreset, 'files'>,
  dryRun: boolean,
): Promise<string[]> {
  const policy = bundle.files[RESOURCE_POLICY_SOURCE];
  if (policy === undefined) return [];
  const planned: [string, string][] = [[RESOURCE_POLICY_TARGET, policy]];
  for (const file of ['AGENTS.md', 'CLAUDE.md']) {
    await rejectSymlinkDestination(root, file);
    const current = await readOptional(path.join(root, file));
    if (file === 'CLAUDE.md' && current === null) continue;
    planned.push([file, withReference(current ?? '# Working in this repository\n')]);
  }
  const changed: [string, string][] = [];
  for (const [file, expected] of planned) {
    await rejectSymlinkDestination(root, file);
    if ((await readOptional(path.join(root, file))) !== expected) changed.push([file, expected]);
  }
  if (!dryRun)
    for (const [file, expected] of changed) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), expected);
    }
  return changed.map(([file]) => file);
}

/** Warning-only during adoption; the vendored bundle hash protects the expected policy text. */
export function resourcePolicyDrift(
  files: Record<string, string | null | undefined>,
  expected: string | null | undefined,
  policyPath = RESOURCE_POLICY_TARGET,
): string[] {
  const problems: string[] = [];
  if (!expected) return ['The adopted standard has no canonical agent resource policy.'];
  if (files[policyPath] !== expected)
    problems.push(`${policyPath} is missing or differs from the adopted policy.`);
  for (const file of ['AGENTS.md', 'CLAUDE.md']) {
    const current = files[file];
    if (file === 'CLAUDE.md' && current == null) continue;
    const sections = current?.match(section) ?? [];
    if (
      sections.length !== 1 ||
      sections[0].trimEnd() !== resourcePolicyReference(policyPath).trimEnd()
    )
      problems.push(`${file} is missing or has a divergent shared resource policy reference.`);
  }
  return problems;
}

export async function resourcePolicyProblems(root: string, expected?: string): Promise<string[]> {
  const files: Record<string, string | null> = {};
  for (const file of [RESOURCE_POLICY_TARGET, 'AGENTS.md', 'CLAUDE.md'])
    files[file] = await readOptional(path.join(root, file));
  return resourcePolicyDrift(
    files,
    expected ?? (await readOptional(path.join(root, '.lvbt/web-platform', RESOURCE_POLICY_SOURCE))),
  );
}
