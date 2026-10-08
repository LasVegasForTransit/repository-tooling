import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { applyPreset } from '../standards/web-platform.ts';

test('community-health publication is generated from reviewed shared source with exact provenance', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-community-'));
  try {
    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'lvbt-community-health' }),
    );
    const bundle = {
      formatVersion: 1,
      preset: 'lvbt-web',
      release: 'v0.7.0',
      commit: 'a'.repeat(40),
      files: {
        'community-health/CONTRIBUTING.md': '# Contributing\n',
        'community-health/pull_request_template.md': '# TL;DR\n',
      },
    };
    const preview = await applyPreset(root, bundle, true);
    assert.ok(preview.consumerChanged.includes('CONTRIBUTING.md'));
    await assert.rejects(readFile(path.join(root, 'CONTRIBUTING.md')));
    await applyPreset(root, bundle);
    const provenance = JSON.parse(await readFile(path.join(root, 'SOURCE.json'), 'utf8'));
    assert.equal(provenance.ref, 'v0.7.0');
    assert.equal(provenance.commit, bundle.commit);
    for (const [file, digest] of Object.entries(provenance.files))
      assert.equal(
        createHash('sha256')
          .update(await readFile(path.join(root, file)))
          .digest('hex'),
        digest,
      );
    assert.deepEqual((await applyPreset(root, bundle, true)).consumerChanged, []);
    await writeFile(path.join(root, 'CONTRIBUTING.md'), 'unrelated local edits');
    await assert.rejects(applyPreset(root, bundle), /CONTRIBUTING.md.*locally changed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('community publication preserves unowned content and refuses symlink destinations', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-community-safe-'));
  try {
    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'lvbt-community-health' }),
    );
    const bundle = {
      formatVersion: 1,
      preset: 'lvbt-web',
      release: null,
      commit: 'a'.repeat(40),
      files: { 'community-health/CONTRIBUTING.md': 'new shared guide' },
    };
    const file = path.join(root, 'CONTRIBUTING.md');
    await writeFile(file, 'existing local guide');
    await assert.rejects(applyPreset(root, bundle), /CONTRIBUTING.md.*locally changed/);
    assert.equal(await readFile(file, 'utf8'), 'existing local guide');
    await rm(file);
    await symlink(path.join(root, 'package.json'), file);
    await assert.rejects(applyPreset(root, bundle), /CONTRIBUTING.md.*symlink/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
