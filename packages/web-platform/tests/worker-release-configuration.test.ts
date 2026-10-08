import { expect, test } from 'vitest';
import { assertWorkerReleaseConfiguration } from '../src/worker-release-configuration.js';
const identity = { productionWorker: 'site', previewWorker: 'site-preview' };
const config = {
  name: 'site',
  d1_databases: [{ binding: 'DB', database_id: 'production' }],
  env: { preview: { d1_databases: [{ binding: 'DB', database_id: 'staging' }] } },
};
test('reviewed releases require separate staging data before any Worker upload', () => {
  expect(() => assertWorkerReleaseConfiguration(config, identity)).not.toThrow();
  expect(() =>
    assertWorkerReleaseConfiguration(
      {
        ...config,
        env: { preview: { d1_databases: [{ binding: 'DB', database_id: 'production' }] } },
      },
      identity,
    ),
  ).toThrow('D1');
  expect(() =>
    assertWorkerReleaseConfiguration(
      { ...config, env: { preview: { d1_databases: [] } } },
      identity,
    ),
  ).toThrow('D1');
});
test('reviewed releases cannot switch either configured Worker namespace', () => {
  expect(() => assertWorkerReleaseConfiguration({ ...config, name: 'other' }, identity)).toThrow(
    'Worker',
  );
  expect(() =>
    assertWorkerReleaseConfiguration(
      { ...config, env: { preview: { ...config.env.preview, name: 'site' } } },
      identity,
    ),
  ).toThrow('Worker');
});
test('preview uploads cannot share writable photo buckets or enable production schedules', () => {
  expect(() =>
    assertWorkerReleaseConfiguration(
      {
        ...config,
        r2_buckets: [{ binding: 'PHOTOS', bucket_name: 'production-photos' }],
        env: {
          preview: {
            ...config.env.preview,
            r2_buckets: [{ binding: 'PHOTOS', bucket_name: 'production-photos' }],
          },
        },
      },
      identity,
    ),
  ).toThrow('R2');
  expect(() =>
    assertWorkerReleaseConfiguration(
      {
        ...config,
        env: { preview: { ...config.env.preview, triggers: { crons: ['0 13 * * *'] } } },
      },
      identity,
    ),
  ).toThrow('schedule');
});
