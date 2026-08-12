import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const pluginRoot = path.resolve(
  import.meta.dirname,
  '../plugins/lvbt-contributions',
);
const repositoryRoot = path.resolve(import.meta.dirname, '..');
const subjectValidator = path.join(
  pluginRoot,
  'scripts/validate-commit-subject.mjs',
);

function run(adapter, payload) {
  return spawnSync(process.execPath, [path.join(pluginRoot, 'hooks', adapter)], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
}

function validateSubject(subject) {
  return spawnSync(process.execPath, [subjectValidator, subject], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
}

async function commitMessageFile(subject) {
  const directory = await mkdtemp(path.join(tmpdir(), 'lvbt-commit-message-'));
  const file = path.join(directory, 'COMMIT_EDITMSG');
  await writeFile(file, `${subject}\n`);
  return file;
}

test('the Codex hook blocks direct pull request creation', () => {
  const result = run('codex-pre-tool-use.mjs', {
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'gh pr create --title test' },
  });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /github-contribution/);
});

test('the Codex plugin loads its Codex-specific hook configuration', async () => {
  const manifest = JSON.parse(
    await readFile(
      path.join(pluginRoot, '.codex-plugin/plugin.json'),
      'utf8',
    ),
  );
  assert.equal(manifest.hooks, './hooks/codex-hooks.json');

  const config = JSON.parse(
    await readFile(path.join(pluginRoot, 'hooks/codex-hooks.json'), 'utf8'),
  );
  const hook = config.hooks.PreToolUse[0];
  assert.match(hook.matcher, /(?:^|\|)Bash(?:\||$)/);
  assert.doesNotMatch(hook.matcher, /functions\.exec/);
  assert.match(hook.hooks[0].command, /\$PLUGIN_ROOT/);
});

test('the Claude hook blocks direct issue creation through gh api', () => {
  const result = run('claude-pre-tool-use.mjs', {
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: {
      command: "gh api --method POST repos/acme/example/issues -f title='test'",
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    JSON.parse(result.stdout).hookSpecificOutput.permissionDecision,
    'deny',
  );
});

test('connector creation tools are blocked', () => {
  const result = run('codex-pre-tool-use.mjs', {
    hook_event_name: 'PreToolUse',
    tool_name: 'mcp__github__create_pull_request',
    tool_input: {},
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    JSON.parse(result.stdout).hookSpecificOutput.permissionDecision,
    'deny',
  );
});

test('ordinary GitHub reads remain available', () => {
  const result = run('claude-pre-tool-use.mjs', {
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'gh issue view 78' },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {});
});

test('the shared validator accepts a closed repository scope', () => {
  const result = validateSubject('chore(repo): standardize contribution tooling');

  assert.equal(result.status, 0, result.stderr);
});

test('the shared validator rejects an invented scope', () => {
  const result = validateSubject(
    'chore(contributing): standardize contribution tooling',
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /scope.*contributing.*allowed/i);
});

test('the shared validator rejects a subject longer than 72 characters', () => {
  const subject = `chore(repo): ${'a'.repeat(61)}`;
  const result = validateSubject(subject);

  assert.equal(subject.length, 74);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /72 characters/i);
});

test('the source repository commit hook rejects an invented scope', async () => {
  const hook = path.join(repositoryRoot, '.githooks/commit-msg');
  const message = await commitMessageFile(
    'chore(contributing): standardize contribution tooling',
  );
  const result = spawnSync(hook, [message], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /scope.*contributing.*allowed/i);
});
