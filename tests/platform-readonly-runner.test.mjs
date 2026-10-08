import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCommand } from '../packages/cli/src/lib/platform/services.mjs';
test('provider inspection cannot trigger pnpm automatic dependency installation', () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'lvbt-readonly-command-'));
  try {
    const result = runCommand(
      process.execPath,
      [
        '-e',
        "if(process.env.pnpm_config_verify_deps_before_run!=='error')require('node:fs').writeFileSync('implicit-install','mutated');",
      ],
      { cwd, env: { pnpm_config_verify_deps_before_run: 'install' } },
    );
    assert.equal(result.status, 0);
    assert.equal(existsSync(path.join(cwd, 'implicit-install')), false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
