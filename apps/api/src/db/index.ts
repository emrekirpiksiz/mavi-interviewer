import pg from 'pg';
import { config } from '../config/index.js';

const { Pool } = pg;

// ============================================
// DATABASE CONNECTION POOL
// ============================================

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    if (!config.databaseUrl) {
      throw new Error('DATABASE_URL is not configured');
    }

    pool = new Pool({
      connectionString: config.databaseUrl,
      max: 10, // Maximum number of connections
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    // Log connection events in development
    if (config.isDevelopment) {
      pool.on('connect', () => {
        console.log('Database: New client connected');
      });

      pool.on('error', (err) => {
        console.error('Database: Unexpected error on idle client', err);
      });
    }
  }

  return pool;
}

// Query helper with automatic pool management
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const pool = getPool();
  const start = Date.now();
  
  try {
    const result = await pool.query<T>(text, params);
    
    if (config.isDevelopment) {
      const duration = Date.now() - start;
      console.log(`Database: Query executed in ${duration}ms`, { 
        rows: result.rowCount,
        query: text.substring(0, 100) + (text.length > 100 ? '...' : '')
      });
    }
    
    return result;
  } catch (error) {
    console.error('Database: Query error', { text, error });
    throw error;
  }
}

// Get a client for transactions
export async function getClient(): Promise<pg.PoolClient> {
  const pool = getPool();
  return pool.connect();
}

// Test database connection
export async function testConnection(): Promise<boolean> {
  try {
    const pool = getPool();
    const result = await pool.query('SELECT NOW()');
    return result.rows.length > 0;
  } catch (error) {
    console.error('Database: Connection test failed', error);
    return false;
  }
}

// Close pool (for graceful shutdown)
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('Database: Pool closed');
  }
}
