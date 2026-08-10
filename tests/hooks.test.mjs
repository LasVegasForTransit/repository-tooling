import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const pluginRoot = path.resolve(
  import.meta.dirname,
  '../plugins/lvbt-contributions',
);

function run(adapter, payload) {
  return spawnSync(process.execPath, [path.join(pluginRoot, 'hooks', adapter)], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
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
