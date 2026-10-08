import path from 'node:path';
import { successful } from './trusted-report.mjs';
import { helperArguments } from './recurring.mjs';

async function pinIssue(action, repository, gh) {
  const [owner, name] = repository.split('/');
  const query =
    'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){issue(number:$number){id isPinned}}}';
  const args = [
    'api',
    'graphql',
    '-f',
    `query=${query}`,
    '-f',
    `owner=${owner}`,
    '-f',
    `name=${name}`,
    '-F',
    `number=${action.number}`,
  ];
  const issue = (await gh(args)).data?.repository?.issue;
  if (typeof issue?.id !== 'string' || typeof issue.isPinned !== 'boolean')
    throw new Error('Could not verify recurring issue pin state.');
  if (!issue.isPinned) {
    await gh([
      'api',
      'graphql',
      '-f',
      'query=mutation($id:ID!){pinIssue(input:{issueId:$id}){issue{id}}}',
      '-f',
      `id=${issue.id}`,
    ]);
    if ((await gh(args)).data?.repository?.issue?.isPinned !== true)
      throw new Error('GitHub did not store the requested recurring issue pin.');
  }
}
async function ensureLabels(actions, repository, context) {
  const labels = await context.gh([
    'label',
    'list',
    '--repo',
    repository,
    '--limit',
    '1000',
    '--json',
    'name',
  ]);
  if (!Array.isArray(labels) || labels.length >= 1000)
    throw new Error('Recurring label inventory is invalid or truncated.');
  for (const name of new Set(actions.flatMap((action) => action.labels)))
    if (!labels.some((label) => label.name === name))
      await successful(
        context.run,
        'gh',
        [
          'label',
          'create',
          name,
          '--repo',
          repository,
          '--color',
          'B60205',
          '--description',
          'Maintained by verified LVBT recurring contribution automation.',
        ],
        { cwd: context.cwd, message: 'Recurring label creation failed.' },
      );
}
async function storedIssue(action, repository, gh) {
  const stored = await gh([
    'issue',
    'view',
    String(action.number),
    '--repo',
    repository,
    '--json',
    'number,title,body,state,labels,url',
  ]);
  if (
    stored.title !== action.title ||
    stored.body?.replaceAll('\r\n', '\n').trimEnd() !== action.body.trimEnd() ||
    stored.state !== (action.action === 'close' ? 'CLOSED' : 'OPEN') ||
    !action.labels.every((name) => stored.labels?.some((label) => label.name === name))
  )
    throw new Error(
      'GitHub stored recurring issue metadata differently from the verified preview.',
    );
  action.url = stored.url;
}
export async function applyRecurring(actions, repository, directory, context) {
  const { run, gh, cwd } = context;
  await ensureLabels(actions, repository, context);
  for (const action of actions) {
    const file = path.join(directory, `${action.key}.md`);
    if (action.action === 'create') {
      const created = JSON.parse(
        await successful(run, process.execPath, helperArguments(action, repository, file), {
          cwd,
          message: 'Recurring contribution creation failed.',
        }),
      );
      action.number = created.number;
    } else {
      await successful(
        run,
        'gh',
        [
          'issue',
          'edit',
          String(action.number),
          '--repo',
          repository,
          '--title',
          action.title,
          '--body-file',
          file,
          ...action.labels.flatMap((name) => ['--add-label', name]),
        ],
        { cwd, message: 'Recurring issue update failed.' },
      );
      if (['close', 'reopen'].includes(action.action))
        await successful(
          run,
          'gh',
          ['issue', action.action, String(action.number), '--repo', repository],
          { cwd, message: 'Recurring issue state update failed.' },
        );
    }
    await storedIssue(action, repository, gh);
    if (action.pin) await pinIssue(action, repository, gh);
  }
}
