import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { expect, test } from 'vitest';
test('preview schema applies before candidate acceptance, production applies after acceptance, and profiles serialize publication', async () => {
  const workflow = await readFile(
    new URL('../../../.github/workflows/release-publish.yml', import.meta.url),
    'utf8',
  );
  const order = [
    'Apply retained preview schema',
    'Upload candidate',
    'Verify candidate',
    'Browser acceptance',
    'Apply retained production schema',
    'Activate verified',
  ];
  const positions = order.map((name) => workflow.indexOf(`name: ${name}`));
  expect(positions.every((position) => position >= 0)).toBe(true);
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
  expect(workflow).toContain('lvbt-publish-${{ github.repository }}-${{ inputs.app');
  expect(workflow).toContain('cancel-in-progress: false');
  expect(workflow).toContain('secrets.CLOUDFLARE_PREVIEW_API_TOKEN');
  expect(workflow).toContain("steps.upload.outputs.protected == 'true'");
});

test('named production installs Chromium before its browser-backed public smoke', async () => {
  const workflow = await readFile(
    new URL('../../../.github/workflows/release-publish.yml', import.meta.url),
    'utf8',
  );
  const namedProduction = workflow.slice(workflow.indexOf('  named-production:'));

  expect(namedProduction).toContain('name: Install Chromium');
  expect(namedProduction.indexOf('name: Install Chromium')).toBeLessThan(
    namedProduction.indexOf('name: Verify activated origin'),
  );
});

test('every migration step supplies a separate D1 credential without overriding the publisher credential', async () => {
  const workflow = await readFile(
    new URL('../../../.github/workflows/release-publish.yml', import.meta.url),
    'utf8',
  );
  const migrations = workflow
    .split('      - name: ')
    .filter((step) => step.startsWith('Apply retained '));
  expect(migrations).toHaveLength(4);
  for (const step of migrations) {
    const environment = step.slice(step.indexOf('        env:'), step.indexOf('        run:'));
    expect(environment).toMatch(/^\s+CLOUDFLARE_MIGRATIONS_API_TOKEN:/mu);
    expect(environment).not.toMatch(/^\s+CLOUDFLARE_API_TOKEN:/mu);
    expect(environment).toContain('secrets.CLOUDFLARE_MIGRATIONS_API_TOKEN ||');
    if (step.startsWith('Apply retained production schema'))
      expect(step).toContain('--expected-version "$EXPECTED_PRODUCTION_VERSION"');
  }
});

test('activation downloads its successful dependency artifact and refuses a missing or ambiguous reference', async () => {
  const workflow = await readFile(
    new URL('../../../.github/workflows/release-publish.yml', import.meta.url),
    'utf8',
  );
  const candidate = workflow.slice(
    workflow.indexOf('  named-candidate:'),
    workflow.indexOf('  named-production:'),
  );
  const production = workflow.slice(workflow.indexOf('  named-production:'));
  expect(candidate).toContain('artifact-id: ${{ steps.proof.outputs.artifact-id }}');
  expect(candidate).toMatch(/name: Retain accepted candidate proof\n\s+id: proof/u);
  const download = production
    .split('      - name: ')
    .find((step) => step.startsWith('Download current-run accepted candidate'));
  expect(download).toContain('artifact-ids: ${{ needs.named-candidate.outputs.artifact-id }}');
  expect(download).not.toContain('github.run_attempt');
  const guard = production
    .split('      - name: ')
    .find((step) => step.startsWith('Require accepted candidate artifact'));
  expect(guard).toContain(
    'CANDIDATE_ARTIFACT_ID: ${{ needs.named-candidate.outputs.artifact-id }}',
  );
  const script = guard
    ?.split('        run: |\n')[1]
    ?.split('\n')
    .map((line) => line.slice(10))
    .join('\n');
  expect(script).toBeTruthy();
  for (const [id, expected] of [
    ['55', 0],
    ['', 1],
    ['55,56', 1],
    ['0', 1],
    ['garbage', 1],
  ] as const) {
    const result = spawnSync('bash', ['-e', '-c', script ?? 'exit 99'], {
      env: { ...process.env, CANDIDATE_ARTIFACT_ID: id },
    });
    expect(result.status, id).toBe(expected);
  }
  expect(production.indexOf('name: Require accepted candidate artifact')).toBeLessThan(
    production.indexOf('name: Download current-run accepted candidate'),
  );
});
