import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse, type ParseError } from 'jsonc-parser';
import { z } from 'zod';
const databases = z.array(
  z.object({ binding: z.string(), database_id: z.string().min(1) }).loose(),
);
const workerConfiguration = z
  .object({
    name: z.string(),
    d1_databases: databases.optional(),
    env: z
      .object({
        preview: z
          .object({ name: z.string().optional(), d1_databases: databases.optional() })
          .loose(),
      })
      .loose(),
  })
  .loose();
export function assertWorkerReleaseConfiguration(
  value: unknown,
  expected: { productionWorker: string; previewWorker: string },
): void {
  const config = workerConfiguration.parse(value);
  if (
    config.name !== expected.productionWorker ||
    (config.env.preview.name ?? `${config.name}-preview`) !== expected.previewWorker
  )
    throw new Error('Reviewed configuration does not match the selected Worker namespaces.');
  const production = config.d1_databases ?? [];
  const preview = config.env.preview.d1_databases ?? [];
  if (
    production.some(
      (database) => !preview.some((candidate) => candidate.binding === database.binding),
    ) ||
    preview.some((database) =>
      production.some((candidate) => candidate.database_id === database.database_id),
    )
  )
    throw new Error('Preview D1 bindings must exist and use separate databases from production.');
}
export async function verifyWorkerReleaseConfiguration(
  directory: string,
  expected: { productionWorker: string; previewWorker: string },
): Promise<void> {
  const errors: ParseError[] = [];
  const value: unknown = parse(
    await readFile(path.join(directory, 'wrangler.jsonc'), 'utf8'),
    errors,
    { allowTrailingComma: true },
  );
  if (errors.length) throw new Error('Invalid reviewed Wrangler configuration.');
  assertWorkerReleaseConfiguration(value, expected);
}
