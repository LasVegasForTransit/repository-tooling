import { waitForWorkerVersion, workerNameFromVersionUrl } from './wait.mjs';

try {
  const versionId = process.env.INPUT_VERSION_ID ?? '';
  await waitForWorkerVersion({
    accountId: process.env.INPUT_ACCOUNT_ID ?? '',
    workerName: workerNameFromVersionUrl(process.env.INPUT_VERSION_URL ?? '', versionId),
    versionId,
    token: process.env.CLOUDFLARE_API_TOKEN,
  });
  process.stdout.write('Uploaded Worker version metadata is ready.\n');
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
