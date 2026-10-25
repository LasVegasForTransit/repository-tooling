import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { verifyCandidateReceipt, type CandidateOperations } from '../src/release-candidate.js';
const config = {
  repository: 'Example/app',
  appDirectory: 'app',
  productionUrl: 'https://example.org',
  previewUrl: 'https://preview.example.org',
  productionWorker: 'app',
  previewWorker: 'app-preview',
  artifactPrefix: 'app-release',
  stagingWorkflow: { name: 'Deploy staging', path: '.github/workflows/deploy.yml', branch: 'main' },
  promotionWorkflow: { file: 'promote.yml', titlePrefix: 'Promote app', branch: 'main' },
};
const context = {
  runId: '900',
  attempt: '2',
  toolsCommit: 'b'.repeat(40),
  sharedCommit: 'c'.repeat(40),
};
const release = {
  formatVersion: 2 as const,
  commit: 'a'.repeat(40),
  releaseId: '123',
  artifactHash: 'd'.repeat(64),
  files: [],
};
const receipt = {
  formatVersion: 1,
  issuer: context,
  release: {
    commit: release.commit,
    releaseId: release.releaseId,
    artifactHash: release.artifactHash,
  },
  preview: {
    worker: 'app-preview',
    origin: config.previewUrl,
    version: '12345678-1234-4234-8234-123456789abc',
  },
  checks: { artifact: 'success', smoke: 'success', browser: 'success' },
};
const run = {
  id: 900,
  run_attempt: 2,
  head_sha: context.toolsCommit,
  head_branch: 'main',
  event: 'workflow_dispatch',
  path: '.github/workflows/promote.yml',
  repository: { full_name: config.repository },
  head_repository: { full_name: config.repository },
};
const jobs = {
  jobs: [
    {
      name: 'publish / Verify named release candidate',
      status: 'completed',
      conclusion: 'success',
    },
  ],
};
const artifacts = {
  artifacts: [
    {
      id: 55,
      name: 'candidate-900-2',
      expired: false,
      workflow_run: { id: 900, head_sha: context.toolsCommit, head_branch: 'main' },
    },
  ],
};
function operations(override: Partial<CandidateOperations> = {}): CandidateOperations {
  return {
    getRun: () => Promise.resolve(run),
    getJobs: () => Promise.resolve(jobs),
    getArtifacts: () => Promise.resolve(artifacts),
    downloadArtifact: () => Promise.resolve(JSON.stringify(receipt) + '\n'),
    ...override,
  };
}
test('candidate proof binds the same manual run, tools, successful job, artifact bytes, and selected release before production writes', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'candidate-proof-'));
  try {
    await writeFile(path.join(directory, 'candidate.json'), JSON.stringify(receipt) + '\n');
    expect(
      await verifyCandidateReceipt(config, release, directory, {
        context,
        operations: operations(),
      }),
    ).toEqual(receipt);
    for (const mutation of [
      { getRun: () => Promise.resolve({ ...run, event: 'push' }) },
      { getRun: () => Promise.resolve({ ...run, head_repository: { full_name: 'Attacker/app' } }) },
      { getJobs: () => Promise.resolve({ jobs: [{ ...jobs.jobs[0], conclusion: 'failure' }] }) },
      {
        getArtifacts: () =>
          Promise.resolve({ artifacts: [{ ...artifacts.artifacts[0], expired: true }] }),
      },
      {
        downloadArtifact: () =>
          Promise.resolve(
            JSON.stringify({ ...receipt, preview: { ...receipt.preview, worker: 'another' } }),
          ),
      },
    ])
      await expect(
        verifyCandidateReceipt(config, release, directory, {
          context,
          operations: operations(mutation),
        }),
      ).rejects.toThrow();
    await expect(
      verifyCandidateReceipt(config, { ...release, artifactHash: 'e'.repeat(64) }, directory, {
        context,
        operations: operations(),
      }),
    ).rejects.toThrow('selected artifact');
    await expect(
      verifyCandidateReceipt(config, release, directory, {
        context: { ...context, attempt: '3' },
        operations: operations(),
      }),
    ).rejects.toThrow('run_attempt');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('an activation-only retry reuses the exact proof and successful candidate job from its earlier attempt', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'candidate-retry-'));
  const earlier = { ...receipt, issuer: { ...context, attempt: '1' } };
  const text = JSON.stringify(earlier) + '\n';
  const queried: string[][] = [];
  try {
    await writeFile(path.join(directory, 'candidate.json'), text);
    expect(
      await verifyCandidateReceipt(config, release, directory, {
        context,
        operations: operations({
          getJobs: (id, attempt) => {
            queried.push([id, attempt]);
            return Promise.resolve(attempt === '1' ? jobs : { jobs: [] });
          },
          getArtifacts: () =>
            Promise.resolve({
              artifacts: [{ ...artifacts.artifacts[0], name: 'candidate-900-1' }],
            }),
          downloadArtifact: (id) => Promise.resolve(id === 55 ? text : 'unexpected artifact'),
        }),
      }),
    ).toEqual(earlier);
    expect(queried).toEqual([['900', '1']]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test.each([
  ['another run', { ...context, runId: '899', attempt: '1' }],
  ['a future attempt', { ...context, attempt: '3' }],
  ['different tools', { ...context, attempt: '1', toolsCommit: 'e'.repeat(40) }],
  ['different shared tooling', { ...context, attempt: '1', sharedCommit: 'e'.repeat(40) }],
])('retry rejects proof from %s', async (_name, issuer) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'candidate-retry-invalid-'));
  try {
    await writeFile(path.join(directory, 'candidate.json'), JSON.stringify({ ...receipt, issuer }));
    await expect(
      verifyCandidateReceipt(config, release, directory, { context, operations: operations() }),
    ).rejects.toThrow('this run');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test.each([
  ['missing retained artifact', { artifacts: [] }],
  [
    'wrong app artifact',
    { artifacts: [{ ...artifacts.artifacts[0], name: 'candidate-900-1-jobs' }] },
  ],
  ['wrong attempt artifact', artifacts],
  [
    'expired artifact',
    { artifacts: [{ ...artifacts.artifacts[0], name: 'candidate-900-1', expired: true }] },
  ],
  [
    'cross-run artifact',
    {
      artifacts: [
        {
          ...artifacts.artifacts[0],
          name: 'candidate-900-1',
          workflow_run: { id: 899, head_sha: context.toolsCommit, head_branch: 'main' },
        },
      ],
    },
  ],
])('retry rejects %s', async (_name, retained) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'candidate-retry-artifact-'));
  const earlier = { ...receipt, issuer: { ...context, attempt: '1' } };
  try {
    await writeFile(path.join(directory, 'candidate.json'), JSON.stringify(earlier));
    await expect(
      verifyCandidateReceipt(config, release, directory, {
        context,
        operations: operations({ getArtifacts: () => Promise.resolve(retained) }),
      }),
    ).rejects.toThrow('one retained artifact');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('retry refuses an unverified earlier candidate and proof bytes changed after retention', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'candidate-retry-unverified-'));
  const earlier = { ...receipt, issuer: { ...context, attempt: '1' } };
  const text = JSON.stringify(earlier) + '\n';
  const previous = operations({
    getArtifacts: () =>
      Promise.resolve({ artifacts: [{ ...artifacts.artifacts[0], name: 'candidate-900-1' }] }),
    downloadArtifact: () => Promise.resolve(text),
  });
  try {
    await writeFile(path.join(directory, 'candidate.json'), text);
    for (const unverified of [
      { jobs: [] },
      { jobs: [{ ...jobs.jobs[0], conclusion: 'failure' }] },
      { jobs: [{ ...jobs.jobs[0], status: 'in_progress', conclusion: null }] },
      { jobs: [...jobs.jobs, ...jobs.jobs] },
    ])
      await expect(
        verifyCandidateReceipt(config, release, directory, {
          context,
          operations: { ...previous, getJobs: () => Promise.resolve(unverified) },
        }),
      ).rejects.toThrow('successful candidate job');
    await expect(
      verifyCandidateReceipt(config, release, directory, {
        context,
        operations: { ...previous, downloadArtifact: () => Promise.resolve(text + '\n') },
      }),
    ).rejects.toThrow('proof bytes differ');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
