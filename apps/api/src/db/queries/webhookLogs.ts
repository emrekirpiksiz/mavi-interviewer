import { query } from '../index.js';

// ============================================
// WEBHOOK LOGS DATABASE QUERIES
// ============================================

// ---------- Types ----------

export type WebhookType = 'assessment_callback';

interface WebhookLogRow {
  id: string;
  session_id: string;
  webhook_type: WebhookType;
  endpoint_url: string;
  request_body: Record<string, unknown>;
  response_status: number | null;
  response_body: Record<string, unknown> | null;
  duration_ms: number | null;
  success: boolean;
  error_message: string | null;
  retry_count: number;
  created_at: Date;
}

export interface WebhookLog {
  id: string;
  sessionId: string;
  webhookType: WebhookType;
  endpointUrl: string;
  requestBody: Record<string, unknown>;
  responseStatus: number | null;
  responseBody: Record<string, unknown> | null;
  durationMs: number | null;
  success: boolean;
  errorMessage: string | null;
  retryCount: number;
  createdAt: string;
}

export interface CreateWebhookLogParams {
  sessionId: string;
  webhookType: WebhookType;
  endpointUrl: string;
  requestBody: Record<string, unknown>;
  responseStatus?: number | null;
  responseBody?: Record<string, unknown> | null;
  durationMs?: number | null;
  success: boolean;
  errorMessage?: string | null;
  retryCount?: number;
}

// ---------- Helpers ----------

function rowToWebhookLog(row: WebhookLogRow): WebhookLog {
  return {
    id: row.id,
    sessionId: row.session_id,
    webhookType: row.webhook_type,
    endpointUrl: row.endpoint_url,
    requestBody: row.request_body,
    responseStatus: row.response_status,
    responseBody: row.response_body,
    durationMs: row.duration_ms,
    success: row.success,
    errorMessage: row.error_message,
    retryCount: row.retry_count,
    createdAt: row.created_at.toISOString(),
  };
}

// ---------- Queries ----------

/**
 * Create a webhook log entry
 */
export async function createWebhookLog(
  params: CreateWebhookLogParams
): Promise<WebhookLog> {
  const result = await query<WebhookLogRow>(
    `INSERT INTO webhook_logs 
     (session_id, webhook_type, endpoint_url, request_body, response_status, response_body, duration_ms, success, error_message, retry_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      params.sessionId,
      params.webhookType,
      params.endpointUrl,
      JSON.stringify(params.requestBody),
      params.responseStatus ?? null,
      params.responseBody ? JSON.stringify(params.responseBody) : null,
      params.durationMs ?? null,
      params.success,
      params.errorMessage ?? null,
      params.retryCount ?? 0,
    ]
  );

  return rowToWebhookLog(result.rows[0]!);
}

/**
 * Get all webhook logs for a session
 */
export async function getWebhookLogsBySessionId(
  sessionId: string
): Promise<WebhookLog[]> {
  const result = await query<WebhookLogRow>(
    `SELECT * FROM webhook_logs 
     WHERE session_id = $1
     ORDER BY created_at DESC`,
    [sessionId]
  );

  return result.rows.map(rowToWebhookLog);
}

/**
 * Get failed webhook logs for retry processing
 */
export async function getFailedWebhookLogs(
  maxRetryCount: number = 3
): Promise<WebhookLog[]> {
  const result = await query<WebhookLogRow>(
    `SELECT * FROM webhook_logs 
     WHERE success = false AND retry_count < $1
     ORDER BY created_at ASC`,
    [maxRetryCount]
  );

  return result.rows.map(rowToWebhookLog);
}

/**
 * Update webhook log after retry
 */
export async function updateWebhookLog(
  id: string,
  updates: {
    responseStatus?: number | null;
    responseBody?: Record<string, unknown> | null;
    durationMs?: number | null;
    success?: boolean;
    errorMessage?: string | null;
    retryCount?: number;
  }
): Promise<WebhookLog | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.responseStatus !== undefined) {
    setClauses.push(`response_status = $${paramIndex++}`);
    values.push(updates.responseStatus);
  }
  if (updates.responseBody !== undefined) {
    setClauses.push(`response_body = $${paramIndex++}`);
    values.push(updates.responseBody ? JSON.stringify(updates.responseBody) : null);
  }
  if (updates.durationMs !== undefined) {
    setClauses.push(`duration_ms = $${paramIndex++}`);
    values.push(updates.durationMs);
  }
  if (updates.success !== undefined) {
    setClauses.push(`success = $${paramIndex++}`);
    values.push(updates.success);
  }
  if (updates.errorMessage !== undefined) {
    setClauses.push(`error_message = $${paramIndex++}`);
    values.push(updates.errorMessage);
  }
  if (updates.retryCount !== undefined) {
    setClauses.push(`retry_count = $${paramIndex++}`);
    values.push(updates.retryCount);
  }

  if (setClauses.length === 0) {
    return null;
  }

  values.push(id);

  const result = await query<WebhookLogRow>(
    `UPDATE webhook_logs 
     SET ${setClauses.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    return null;
  }

  return rowToWebhookLog(result.rows[0]!);
}
