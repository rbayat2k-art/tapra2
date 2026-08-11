import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotEnv } from 'dotenv';
import { Client } from 'pg';

loadDotEnv({ path: '.env.local', quiet: true });
loadDotEnv({ quiet: true });

export async function runMigrations(connectionString = process.env.DATABASE_MIGRATION_URL): Promise<void> {
  if (!connectionString?.startsWith('postgresql://')) {
    throw new Error('DATABASE_MIGRATION_URL is required and must use postgresql://');
  }

  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const migrationsDirectory = path.resolve(scriptDirectory, '../migrations');
  const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith('.sql')).sort();
  const client = new Client({ connectionString, application_name: 'tapra2_migrations' });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        checksum char(64) NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query('SELECT pg_advisory_lock($1)', [2_026_081_101]);

    for (const file of files) {
      const sql = await readFile(path.join(migrationsDirectory, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query<{ checksum: string }>('SELECT checksum FROM schema_migrations WHERE name = $1', [file]);
      if (existing.rowCount) {
        if (existing.rows[0]?.checksum !== checksum) throw new Error(`Applied migration checksum changed: ${file}`);
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(name, checksum) VALUES ($1, $2)', [file, checksum]);
        await client.query('COMMIT');
        console.log(`Applied migration ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [2_026_081_101]).catch(() => undefined);
    await client.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMigrations().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Migration failed.');
    process.exit(1);
  });
}
