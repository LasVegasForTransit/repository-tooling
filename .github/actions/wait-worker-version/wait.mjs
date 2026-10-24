const delays = [1000, 2000, 4000, 8000, 15000, 30000, 30000, 30000];
const versionPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export function workerNameFromVersionUrl(value, versionId) {
  const url = new URL(value);
  const prefix = `${versionId.slice(0, 8)}-`;
  const label = url.hostname.split('.')[0];
  if (
    !versionPattern.test(versionId) ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !url.hostname.endsWith('.workers.dev') ||
    !label.startsWith(prefix)
  ) {
    throw new Error('The uploaded version URL does not match the selected version.');
  }
  const workerName = label.slice(prefix.length);
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(workerName)) throw new Error('Invalid uploaded Worker name.');
  return workerName;
}

function assertSelection({ accountId, workerName, versionId, token }) {
  if (
    !/^[a-f0-9]{32}$/.test(accountId) ||
    !versionPattern.test(versionId) ||
    !/^[a-z0-9][a-z0-9_-]*$/.test(workerName) ||
    !token
  )
    throw new Error('Select the uploaded Worker version and existing deployment credentials.');
}

export async function waitForWorkerVersion({
  accountId,
  workerName,
  versionId,
  token,
  fetch = globalThis.fetch,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  assertSelection({ accountId, workerName, versionId, token });
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${encodeURIComponent(workerName)}/versions/${versionId}`;
  for (let attempt = 0; ; attempt++) {
    let response, body;
    try {
      response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      body = await response.json();
    } catch {
      throw new Error('Worker version metadata request failed.');
    }
    if (response.ok && body.success === true) {
      if (body.result?.id !== versionId)
        throw new Error('Worker metadata does not match the selected version.');
      return;
    }
    const delay = delays[attempt];
    if (
      response.status !== 404 ||
      body.success !== false ||
      !Array.isArray(body.errors) ||
      !body.errors.length ||
      !body.errors.every((error) => error.code === 100146) ||
      delay === undefined
    ) {
      throw new Error(`Worker version metadata unavailable (HTTP ${response.status}).`);
    }
    await wait(delay);
  }
}
