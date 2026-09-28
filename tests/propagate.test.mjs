import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  applyRelease,
  compareReleases,
  latestRelease,
  planOpenUpdates,
  propagationTargets,
  pullRequestBody,
  pullRequestTitle,
  readRegistry,
  updateBranch,
} from '../standards/propagate.ts';
import { materializeTemplate } from '../standards/template-publication.ts';

const root = path.resolve(import.meta.dirname, '..');
const git = (directory, ...args) =>
  execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim();

test('every template and consumer receives each release, and the source does not', async () => {
  const registry = await readRegistry();
  const targets = propagationTargets(registry);
  assert.ok(!targets.some(({ name }) => name === 'repository-tooling'));
  assert.equal(targets.length, registry.repositories.length - 1);
  for (const entry of targets) {
    if (entry.kind === 'template') assert.equal(entry.name, `template-${entry.example}`);
    else assert.equal(entry.kind, 'consumer');
  }
});

test('releases compare by version, not by text', () => {
  assert.ok(compareReleases('v0.10.0', 'v0.9.9') > 0);
  assert.equal(compareReleases('v1.2.3', 'v1.2.3'), 0);
  assert.equal(latestRelease(['v0.4.5', 'v0.3.0-rc.15', 'v0.10.1', 'v0.4.10']), 'v0.10.1');
  assert.throws(() => updateBranch('v0.3.0-rc.1'), /stable release tag/);
});

test('an update supersedes older update pull requests and yields to newer ones', () => {
  const open = [
    { number: 1, headRefName: 'automation/repository-standard-v0.4.3' },
    { number: 2, headRefName: 'automation/repository-standard-v0.4.5' },
    { number: 3, headRefName: 'automation/repository-standard-v0.5.0' },
    { number: 4, headRefName: 'feat/something-else' },
  ];
  const plan = planOpenUpdates(open, 'v0.4.5');
  assert.deepEqual(
    plan.superseded.map(({ number }) => number),
    [1],
  );
  assert.deepEqual(
    plan.newer.map(({ number }) => number),
    [3],
  );
});

test('the update pull request follows the organization template', () => {
  const body = pullRequestBody({ tag: 'v0.4.5', kind: 'consumer', hasNotes: true });
  assert.deepEqual(
    [...body.matchAll(/^# (.+)$/gm)].map(([, heading]) => heading),
    ['TL;DR', 'Overview of Changes', 'Follow-ups'],
  );
  assert.match(body, /release-0-4-5\.md/);
  assert.match(body, /merges itself once `Validate` passes/);
  assert.doesNotMatch(body, /<!--/);
  assert.match(pullRequestTitle('v0.4.5'), /^chore: /);
});

test('a release moves a repository forward once, with its own updater, and never backward', async (t) => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'lvbt-propagate-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const source = path.join(fixture, 'source');
  execFileSync('git', ['clone', '--quiet', '--shared', root, source]);
  git(source, 'tag', 'v99.0.0', 'HEAD');

  const consumer = path.join(fixture, 'consumer');
  await materializeTemplate({ source, target: consumer, example: 'basic', release: 'v99.0.0' });
  git(consumer, 'init', '--quiet', '--initial-branch', 'main');
  git(consumer, 'add', '-A');
  git(
    consumer,
    '-c',
    'user.name=test',
    '-c',
    'user.email=test@example.org',
    'commit',
    '-qm',
    'init',
  );

  const template = path.join(fixture, 'template');
  await materializeTemplate({ source, target: template, example: 'basic', release: 'v99.0.0' });
  await writeFile(path.join(template, 'pnpm-lock.yaml'), 'lockfileVersion: published\n');
  git(template, 'init', '--quiet', '--initial-branch', 'main');
  git(template, 'add', '-A');
  git(
    template,
    '-c',
    'user.name=test',
    '-c',
    'user.email=test@example.org',
    'commit',
    '-qm',
    'init',
  );
  const templateEntry = {
    name: 'template-basic',
    requiredStatus: 'Validate',
    kind: 'template',
    example: 'basic',
  };
  assert.deepEqual(
    await applyRelease({
      source,
      target: template,
      entry: templateEntry,
      tag: 'v99.0.0',
      install: false,
    }),
    { changed: false },
    'republishing the same release keeps the published lockfile and proposes nothing',
  );

  await writeFile(
    path.join(source, 'packages/cli/catalog.json'),
    `${await readFile(path.join(source, 'packages/cli/catalog.json'), 'utf8')}\n`,
  );
  git(
    source,
    '-c',
    'user.name=test',
    '-c',
    'user.email=test@example.org',
    'commit',
    '-qam',
    'next',
  );
  git(source, 'tag', 'v99.0.1', 'HEAD');

  const entry = { name: 'consumer', requiredStatus: 'Validate', kind: 'consumer' };
  const first = await applyRelease({
    source,
    target: consumer,
    entry,
    tag: 'v99.0.1',
    install: false,
  });
  assert.deepEqual(first, { changed: true });
  assert.equal(git(consumer, 'branch', '--show-current'), 'automation/repository-standard-v99.0.1');
  assert.equal(git(consumer, 'log', '-1', '--format=%ae'), 'noreply@lasvegasfortransit.org');
  const manifest = JSON.parse(
    await readFile(path.join(consumer, '.lvbt/web-platform.json'), 'utf8'),
  );
  assert.equal(manifest.release, 'v99.0.1');

  assert.deepEqual(
    await applyRelease({ source, target: consumer, entry, tag: 'v99.0.1', install: false }),
    { changed: false },
  );
  const older = await applyRelease({
    source,
    target: consumer,
    entry,
    tag: 'v99.0.0',
    install: false,
  });
  assert.equal(older.changed, false);
  assert.match(older.reason ?? '', /newer than v99\.0\.0/);
});

test('the publish workflow proposes every release through the shared helper and the bot', async () => {
  const workflow = await readFile(
    path.join(root, '.github/workflows/publish-standard.yml'),
    'utf8',
  );
  assert.match(workflow, /^ {2}push:\n {4}tags:/m);
  assert.match(workflow, /^ {2}schedule:/m);
  assert.match(workflow, /^ {2}workflow_dispatch:/m);
  assert.match(workflow, /actions\/create-github-app-token@[0-9a-f]{40}/);
  assert.match(workflow, /LVBT_BOT_PRIVATE_KEY/);
  assert.match(workflow, /standards\/repositories\.json/);
  assert.match(workflow, /node tooling\/standards\/propagate\.ts/);
  assert.doesNotMatch(workflow, /TEMPLATE_PUBLISH_TOKEN/);

  const propagate = await readFile(path.join(root, 'standards/propagate.ts'), 'utf8');
  assert.match(propagate, /github-create\.mjs/);
  assert.match(propagate, /'--auto', '--rebase'/);
  assert.doesNotMatch(propagate, /'pr', 'create'/);
});
