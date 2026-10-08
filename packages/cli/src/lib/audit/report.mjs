import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { checks, execute } from './index.mjs';

const helper = new URL(
  '../../../plugins/lvbt-contributions/scripts/github-create.mjs',
  import.meta.url,
).pathname;
const titleNames = { links: 'Links', lighthouse: 'Lighthouse', dependencies: 'Dependency' };
const labelNames = (result) => [
  'bug',
  'audit-owned',
  `audit:${result.check}`,
  `target:${result.target}`,
];
const normalize = (body) => body.replaceAll('\r\n', '\n').trimEnd();
const idNumber = (id) => BigInt(String(id));

function validateResult(result, report, seen) {
  const key = `${result.check}:${result.target}`;
  const valid = [
    checks.includes(result.check),
    result.target === report.target,
    ['pass', 'fail', 'error', 'skipped'].includes(result.status),
    Array.isArray(result.findings),
    Array.isArray(result.artifacts),
    Array.isArray(result.command),
    !seen.has(key),
  ];
  if (valid.some((value) => !value))
    throw new Error('Audit report contains invalid or duplicate results.');
  if (result.status === 'pass' && result.findings.length)
    throw new Error('Passing audit cannot contain failure findings.');
  if (
    result.status === 'fail' &&
    (!result.findings.length ||
      result.findings.some(
        (finding) => typeof finding.title !== 'string' || typeof finding.diagnostic !== 'string',
      ))
  )
    throw new Error('Failed audit requires concrete findings.');
  seen.add(key);
}
function validate(report) {
  if (!report.run) throw new Error('Audit report has no trusted workflow provenance.');
  const valid = [
    report.version === 1,
    /^[\w.-]+\/[\w.-]+$/.test(report.repository ?? ''),
    /^[a-f\d]{40}$/i.test(report.commit ?? ''),
    /^\d+$/.test(String(report.run.id)),
    Number.isSafeInteger(report.run.attempt),
    report.run.attempt >= 1,
    ['local', 'production'].includes(report.target),
    Array.isArray(report.results),
  ];
  if (valid.some((value) => !value) || !report.results.length)
    throw new Error('Audit report has no valid trusted provenance or results.');
  const seen = new Set();
  for (const result of report.results) validateResult(result, report, seen);
}
async function successful(run, command, args, { cwd, message }) {
  const result = await run(command, args, { cwd });
  if (result.status !== 0) throw new Error(result.stderr || message);
  return result.stdout;
}
function verifyIdentity(report, remote, repository, config) {
  const workflow = config.audits?.workflow ?? '.github/workflows/audits.yml';
  const matches = [
    [remote.repository?.full_name, report.repository],
    [report.run.repository, report.repository],
    [remote.head_branch, repository.default_branch],
    [report.run.headBranch, remote.head_branch],
    [remote.head_sha, report.commit],
    [report.run.headSha, remote.head_sha],
    [report.run.event, remote.event],
    [remote.path?.split('@')[0], workflow],
    [report.run.workflow, workflow],
    [remote.run_attempt, report.run.attempt],
    [String(remote.id), String(report.run.id)],
    [remote.html_url, report.run.url],
  ];
  if (
    !['schedule', 'workflow_dispatch'].includes(remote.event) ||
    matches.some(([actual, expected]) => actual !== expected)
  )
    throw new Error(
      'Audit run is not a trusted default-branch schedule or manual workflow result.',
    );
}
function newer(candidate, remote) {
  if (!['schedule', 'workflow_dispatch'].includes(candidate.event)) return false;
  return (
    idNumber(candidate.id) > idNumber(remote.id) ||
    (String(candidate.id) === String(remote.id) && candidate.run_attempt > remote.run_attempt)
  );
}
async function verifyArtifact(report, config, run, cwd) {
  const directory = await mkdtemp(path.join(tmpdir(), 'lvbt-audit-evidence-'));
  try {
    const artifactName = config.audits?.artifactName ?? 'lvbt-audit-report';
    const metadata = JSON.parse(
      await successful(
        run,
        'gh',
        ['api', `repos/${report.repository}/actions/runs/${report.run.id}/artifacts?per_page=100`],
        { cwd, message: 'Could not verify audit artifact metadata.' },
      ),
    );
    const artifacts =
      metadata.artifacts?.filter(
        (artifact) => artifact.name === artifactName && !artifact.expired,
      ) ?? [];
    if (artifacts.length !== 1 || !/^\d+$/.test(String(artifacts[0].id)))
      throw new Error('Trusted audit artifact is missing, expired, or ambiguous.');
    await successful(
      run,
      'gh',
      [
        'run',
        'download',
        String(report.run.id),
        '--repo',
        report.repository,
        '--name',
        artifactName,
        '--dir',
        directory,
      ],
      { cwd, message: 'Could not download trusted audit artifact.' },
    );
    const stored = JSON.parse(
      await readFile(path.join(directory, 'lvbt-audit-report.json'), 'utf8'),
    );
    if (!isDeepStrictEqual(stored, report))
      throw new Error('Input report does not match the trusted workflow artifact.');
    return `${report.run.url}/artifacts/${artifacts[0].id}`;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
async function verifiedRun(report, config, run, cwd) {
  const gh = async (args) =>
    JSON.parse(
      await successful(run, 'gh', args, { cwd, message: 'GitHub provenance verification failed.' }),
    );
  const repository = await gh(['api', `repos/${report.repository}`]);
  const remote = await gh(['api', `repos/${report.repository}/actions/runs/${report.run.id}`]);
  verifyIdentity(report, remote, repository, config);
  const latest = await gh([
    'api',
    `repos/${report.repository}/actions/workflows/${remote.workflow_id}/runs?branch=${encodeURIComponent(repository.default_branch)}&per_page=100`,
  ]);
  if (
    !Array.isArray(latest.workflow_runs) ||
    latest.workflow_runs.some((candidate) => newer(candidate, remote))
  )
    throw new Error('Audit report is stale relative to a newer trusted workflow run.');
  const artifactUrl = await verifyArtifact(report, config, run, cwd);
  return { gh, artifactUrl };
}
function issueBody(report, result) {
  const command = result.command.join(' ');
  const findings = result.findings
    .map(
      (finding) =>
        `- ${finding.title}: ${finding.diagnostic}${finding.location ? ` Location: ${finding.location}.` : ''}${finding.url ? ` See ${finding.url}.` : ''}`,
    )
    .join('\n');
  return `# Steps to reproduce\n\nRun \`${command.replaceAll('`', '\\`')}\` against ${result.target} at commit ${report.commit}.\n\n# Expected behavior\n\nThe ${result.check} audit passes without findings.\n\n# Actual behavior\n\n${result.status === 'pass' ? 'The verified audit now passes.' : findings}\n\n# Additional context\n\nAudit owner: LVBT shared audit automation.\n\nVerified run: ${report.run.id} (attempt ${report.run.attempt}).\n\nWorkflow: [${report.run.workflow}](${report.run.url}).\n\nCommit: [${report.commit}](https://github.com/${report.repository}/commit/${report.commit}).\n\nArtifacts: [Download the verified audit evidence](${report.artifactUrl}).${result.artifacts.length ? ` Raw files: ${result.artifacts.join(', ')}.` : ''}\n`;
}
function ownedIssue(issues, labels, result, report) {
  const matches = issues.filter((issue) =>
    labels.slice(1).every((name) => issue.labels.some((label) => label.name === name)),
  );
  if (matches.length > 1)
    throw new Error(`Multiple audit-owned issues match ${result.check}/${result.target}.`);
  const issue = matches[0];
  if (!issue) return undefined;
  const previous = issue.body.match(/Verified run: (\d+) \(attempt (\d+)\)\./);
  if (
    previous &&
    (idNumber(previous[1]) > idNumber(report.run.id) ||
      (previous[1] === String(report.run.id) && Number(previous[2]) > report.run.attempt))
  )
    throw new Error('Audit result is stale relative to the issue evidence.');
  return issue;
}
function lifecycleAction(result, issue) {
  if (result.status === 'pass') return 'close';
  if (!issue) return 'create';
  return issue.state === 'CLOSED' ? 'reopen' : 'update';
}
function actionsFor(report, issues) {
  if (!Array.isArray(issues)) throw new Error('GitHub returned invalid issue data.');
  if (issues.length >= 1000)
    throw new Error('Audit-owned issue search is truncated; refusing ambiguous updates.');
  const actions = [];
  for (const result of report.results) {
    if (!['pass', 'fail'].includes(result.status)) continue;
    const labels = labelNames(result);
    const issue = ownedIssue(issues, labels, result, report);
    if (result.status === 'pass' && (!issue || issue.state === 'CLOSED')) continue;
    actions.push({
      action: lifecycleAction(result, issue),
      check: result.check,
      target: result.target,
      title: `${titleNames[result.check]} audit fails in ${result.target}`,
      body: issueBody(report, result),
      labels,
      ...(issue ? { number: issue.number, url: issue.url } : {}),
    });
  }
  return actions;
}
const bodyFile = (directory, action) => path.join(directory, `${action.check}-${action.target}.md`);
function helperArguments(action, report, file) {
  return [
    helper,
    'issue',
    '--type',
    'bug',
    '--title',
    action.title,
    '--body-file',
    file,
    '--repo',
    report.repository,
    '--audit-check',
    action.check,
    '--audit-target',
    action.target,
    '--json',
  ];
}
async function previewActions(actions, report, directory, { run, cwd }) {
  for (const action of actions) {
    const file = bodyFile(directory, action);
    await writeFile(file, action.body);
    const output = await successful(
      run,
      process.execPath,
      [...helperArguments(action, report, file), '--dry-run'],
      { cwd, message: 'Audit contribution preview failed.' },
    );
    const checked = JSON.parse(output);
    if (
      checked.title !== action.title ||
      normalize(checked.body) !== normalize(action.body) ||
      !isDeepStrictEqual(checked.labels, action.labels)
    )
      throw new Error('Contribution helper preview differs from the audit action.');
  }
}
async function ensureLabels(actions, report, { gh, run, cwd }) {
  const existing = await gh([
    'label',
    'list',
    '--repo',
    report.repository,
    '--limit',
    '1000',
    '--json',
    'name',
  ]);
  for (const name of new Set(actions.flatMap((action) => action.labels))) {
    if (existing.some((label) => label.name === name)) continue;
    const description =
      name === 'audit-owned'
        ? 'Maintained by the verified LVBT audit workflow.'
        : 'LVBT audit classification.';
    await successful(
      run,
      'gh',
      [
        'label',
        'create',
        name,
        '--repo',
        report.repository,
        '--color',
        'B60205',
        '--description',
        description,
      ],
      { cwd, message: `Could not create audit label ${name}.` },
    );
  }
}
async function updateAction(action, report, file, { run, cwd }) {
  await successful(
    run,
    'gh',
    [
      'issue',
      'edit',
      String(action.number),
      '--repo',
      report.repository,
      '--title',
      action.title,
      '--body-file',
      file,
    ],
    { cwd, message: 'Audit issue update failed.' },
  );
  if (action.action === 'close' || action.action === 'reopen')
    await successful(
      run,
      'gh',
      ['issue', action.action, String(action.number), '--repo', report.repository],
      { cwd, message: 'Audit issue state update failed.' },
    );
}
async function verifyAction(action, report, gh) {
  const stored = await gh([
    'issue',
    'view',
    String(action.number),
    '--repo',
    report.repository,
    '--json',
    'number,title,body,state,labels,url',
  ]);
  const expectedState = action.action === 'close' ? 'CLOSED' : 'OPEN';
  const same = [
    stored.title === action.title,
    normalize(stored.body) === normalize(action.body),
    stored.state === expectedState,
    action.labels.every((name) => stored.labels.some((label) => label.name === name)),
  ];
  if (same.some((value) => !value))
    throw new Error(
      `GitHub stored audit issue ${action.number} differently from the verified preview.`,
    );
  action.url = stored.url;
}
async function applyActions(actions, report, directory, { gh, run, cwd }) {
  await ensureLabels(actions, report, { gh, run, cwd });
  for (const action of actions) {
    const file = bodyFile(directory, action);
    if (action.action === 'create') {
      const output = await successful(
        run,
        process.execPath,
        helperArguments(action, report, file),
        { cwd, message: 'Audit issue creation failed.' },
      );
      const stored = JSON.parse(output);
      action.number = stored.number;
      action.url = stored.url;
    } else await updateAction(action, report, file, { run, cwd });
    await verifyAction(action, report, gh);
  }
}
export async function reportAudit({ cwd, input, dryRun = false, config, execute: run = execute }) {
  if (!input) throw new Error('Audit reporting requires --input.');
  if (!config) {
    const { readTooling } = await import('../tooling.mjs');
    config = await readTooling(cwd);
  }
  const report = JSON.parse(await readFile(path.resolve(cwd, input), 'utf8'));
  validate(report);
  const { gh, artifactUrl } = await verifiedRun(report, config, run, cwd);
  const issues = await gh([
    'issue',
    'list',
    '--repo',
    report.repository,
    '--state',
    'all',
    '--label',
    'audit-owned',
    '--limit',
    '1000',
    '--json',
    'number,title,body,state,labels,url',
  ]);
  const actions = actionsFor({ ...report, artifactUrl }, issues);
  const preview = { valid: true, dryRun, repository: report.repository, run: report.run, actions };
  if (!actions.length) return preview;
  const directory = await mkdtemp(path.join(tmpdir(), 'lvbt-audit-issues-'));
  try {
    await previewActions(actions, report, directory, { run, cwd });
    if (!dryRun) await applyActions(actions, report, directory, { gh, run, cwd });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  return preview;
}
