import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { githubReader } from '../packages/web-platform/src/github-read.ts';
import { githubGovernanceDoctor } from '../packages/web-platform/src/github-governance.ts';

const standard = JSON.parse(
  await readFile(new URL('../standards/ruleset.json', import.meta.url), 'utf8'),
);

async function withGitHub(output, status, inspect) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'github-reader-'));
  const previousPath = process.env.PATH;
  try {
    const bin = path.join(root, 'bin');
    await mkdir(bin);
    await writeFile(
      path.join(bin, 'gh'),
      `#!/usr/bin/env node
const assert=require('node:assert/strict');
assert.deepEqual(process.argv.slice(2,9), ['api','--hostname','github.com','--method','GET','--paginate','--slurp']);
process.stdout.write(${JSON.stringify(output)});
process.exitCode=${status};
`,
      { mode: 0o755 },
    );
    process.env.PATH = `${bin}:${previousPath}`;
    await inspect(githubReader(root));
  } finally {
    process.env.PATH = previousPath;
    await rm(root, { recursive: true, force: true });
  }
}

test('a successful empty GitHub response establishes enabled vulnerability alerts', async () => {
  await withGitHub('[]', 0, async (read) => {
    assert.equal(await read('repos/LVBT/example/vulnerability-alerts'), null);
    const checks = await githubGovernanceDoctor(
      { repository: 'LVBT/example', ruleset: standard },
      read,
    );
    assert.equal(checks.find((check) => check.id === 'vulnerability-alerts').status, 'pass');
  });
});

test('a failed empty GitHub response cannot establish enabled vulnerability alerts', async () => {
  await withGitHub('[]', 1, async (read) => {
    const checks = await githubGovernanceDoctor(
      { repository: 'LVBT/example', ruleset: standard },
      read,
    );
    assert.equal(checks.find((check) => check.id === 'vulnerability-alerts').status, 'unknown');
  });
});

test('successful GitHub reads still flatten paginated arrays and inventories', async () => {
  await withGitHub('[[{"id":1}],[{"id":2}]]', 0, async (read) => {
    assert.deepEqual(await read('repos/LVBT/example/rulesets'), [{ id: 1 }, { id: 2 }]);
  });
  await withGitHub(
    '[{"variables":[{"name":"A"}]},{"variables":[{"name":"B"}]}]',
    0,
    async (read) => {
      assert.deepEqual(await read('repos/LVBT/example/actions/variables'), {
        variables: [{ name: 'A' }, { name: 'B' }],
      });
    },
  );
});

test('malformed successful GitHub evidence remains unreadable', async () => {
  await withGitHub('{"invalid":"not slurped"}', 0, async (read) => {
    await assert.rejects(read('repos/LVBT/example'), /GitHub read failed/);
  });
});
