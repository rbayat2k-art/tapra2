import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { getEnvironment } from '../../config/env.js';

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getEnvironment().DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: 'tapra2_server',
    });
  }
  return pool;
}

export async function query<Row extends QueryResultRow = QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
): Promise<QueryResult<Row>> {
  return getPool().query<Row>(text, [...values]);
}

export interface TenantDatabaseContext {
  workspaceId: string;
  companyId: string;
}

export interface WorkspaceDatabaseContext {
  workspaceId: string;
  companyId: string | null;
}

export async function withWorkspaceTransaction<T>(
  context: WorkspaceDatabaseContext,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.workspace_id', $1, true), set_config('app.company_id', $2, true)", [
      context.workspaceId,
      context.companyId ?? '',
    ]);
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function withTenantTransaction<T>(
  context: TenantDatabaseContext,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return withWorkspaceTransaction(context, operation);
}

export async function closePool(): Promise<void> {
  if (pool) await pool.end();
  pool = undefined;
}
