import assert from 'node:assert/strict';
import test from 'node:test';
import {
  waitForWorkerVersion,
  workerNameFromVersionUrl,
} from '../.github/actions/wait-worker-version/wait.mjs';

const versionId = '11111111-2222-4333-8444-555555555555';
const selection = {
  accountId: 'a'.repeat(32),
  workerName: 'fixture-preview',
  versionId,
  token: 'fixture',
};
const missing = () =>
  Response.json({ success: false, errors: [{ code: 100146 }] }, { status: 404 });

void test('the exact uploaded version can become readable without another upload', async () => {
  const urls = [],
    waits = [];
  await waitForWorkerVersion({
    ...selection,
    wait: async (delay) => {
      waits.push(delay);
    },
    fetch: async (url) => {
      urls.push(url);
      return urls.length < 3
        ? missing()
        : Response.json({ success: true, result: { id: versionId } });
    },
  });
  assert.equal(urls.length, 3);
  assert.equal(new Set(urls).size, 1);
  assert.equal(waits.length, 2);
});

void test('persistent missing metadata stops after a bounded wait', async () => {
  let requests = 0;
  const waits = [];
  await assert.rejects(
    waitForWorkerVersion({
      ...selection,
      wait: async (delay) => {
        waits.push(delay);
      },
      fetch: async () => {
        requests++;
        return missing();
      },
    }),
    /HTTP 404/,
  );
  assert.ok(requests > 1 && requests <= 10);
  assert.ok(waits.reduce((sum, delay) => sum + delay, 0) <= 120000);
});

void test('permission failures and a different version never become readiness', async () => {
  for (const response of [
    () => Response.json({ success: false, errors: [{ code: 10000 }] }, { status: 403 }),
    () => Response.json({ success: false, errors: [{ code: 10007 }] }, { status: 404 }),
    () => Response.json({ success: true, result: { id: 'another-version' } }),
  ]) {
    let requests = 0;
    await assert.rejects(
      waitForWorkerVersion({
        ...selection,
        wait: async () => {
          assert.fail('unexpected retry');
        },
        fetch: async () => {
          requests++;
          return response();
        },
      }),
    );
    assert.equal(requests, 1);
  }
});

void test('the uploaded URL binds the Worker name to the selected version', () => {
  const url = `https://${versionId.slice(0, 8)}-fixture-preview.account.workers.dev`;
  assert.equal(workerNameFromVersionUrl(url, versionId), 'fixture-preview');
  assert.throws(() => workerNameFromVersionUrl(url.replace('.workers.dev', '.invalid'), versionId));
  assert.throws(() => workerNameFromVersionUrl(url.replace('11111111-', '00000000-'), versionId));
});
