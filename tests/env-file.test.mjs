import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const moduleFile = new URL('../packages/cli/src/lib/env-file.mjs', import.meta.url);
async function fixture(run) {
  assert.ok(existsSync(moduleFile), 'the shared CLI must expose environment helpers');
  const helpers = await import(moduleFile.href);
  const directory = mkdtempSync(path.join(os.tmpdir(), 'lvbt-env-'));
  try {
    await run(path.join(directory, '.env.local'), helpers);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('environment parsing retains quoted values and tolerates a missing local file', () =>
  fixture((file, { parseEnvFile }) => {
    assert.deepEqual(parseEnvFile(file), new Map());
    writeFileSync(file, '# comment\nTOKEN="test # value"\nID = \'data-source\'\nEMPTY=\n');
    assert.deepEqual(
      parseEnvFile(file),
      new Map([
        ['TOKEN', 'test # value'],
        ['ID', 'data-source'],
        ['EMPTY', ''],
      ]),
    );
  }));

test('an env update preserves unrelated values and comments and a repeated update performs no write', () =>
  fixture((file, { mergeEnvFile }) => {
    const original = '# preserve this\nAPI_KEY=local-test-key\nDATA_SOURCE=old\n';
    writeFileSync(file, original, { mode: 0o640 });
    assert.equal(mergeEnvFile(file, new Map([['DATA_SOURCE', 'new']])), true);
    const next = '# preserve this\nAPI_KEY=local-test-key\nDATA_SOURCE=new\n';
    assert.equal(readFileSync(file, 'utf8'), next);
    assert.equal(statSync(file).mode & 0o777, 0o600);
    const stamp = statSync(file).mtimeMs;
    assert.equal(mergeEnvFile(file, new Map([['DATA_SOURCE', 'new']])), false);
    assert.equal(statSync(file).mtimeMs, stamp);
  }));

test('loading an env file fills missing values and keeps explicit shell overrides', () =>
  fixture((file, { loadEnvFile }) => {
    writeFileSync(file, 'TOKEN=file-test-value\nDATA_SOURCE=new\n');
    const environment = { TOKEN: 'shell-test-value' };
    loadEnvFile(file, environment);
    assert.deepEqual(environment, { TOKEN: 'shell-test-value', DATA_SOURCE: 'new' });
  }));
