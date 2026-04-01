import { query } from '../index.js';
import type { InterviewConfig, Position, Candidate, InterviewTopic, SessionSettings } from '@ai-interview/shared';

// ============================================
// INTERVIEW CONFIG DATABASE QUERIES
// ============================================

// ---------- Types ----------

interface ConfigRow {
  id: string;
  session_id: string;
  position_data: Position;
  candidate_data: Candidate;
  topics: InterviewTopic[];
  settings: SessionSettings | null;
  created_at: Date;
  deleted_at: Date | null;
}

interface CreateConfigParams {
  sessionId: string;
  positionData: Position;
  candidateData: Candidate;
  topics: InterviewTopic[];
  settings?: SessionSettings;
}

// ---------- Helpers ----------

function rowToConfig(row: ConfigRow): InterviewConfig {
  return {
    id: row.id,
    sessionId: row.session_id,
    positionData: row.position_data,
    candidateData: row.candidate_data,
    topics: row.topics,
    settings: row.settings ?? undefined,
    createdAt: row.created_at.toISOString(),
    deletedAt: row.deleted_at?.toISOString() ?? null,
  };
}

// ---------- Queries ----------

/**
 * Create interview config for a session
 */
export async function createConfig(
  params: CreateConfigParams
): Promise<InterviewConfig> {
  const result = await query<ConfigRow>(
    `INSERT INTO interview_configs (session_id, position_data, candidate_data, topics, settings)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      params.sessionId,
      JSON.stringify(params.positionData),
      JSON.stringify(params.candidateData),
      JSON.stringify(params.topics),
      JSON.stringify(params.settings ?? {}),
    ]
  );

  return rowToConfig(result.rows[0]!);
}

/**
 * Get interview config by session ID
 */
export async function getConfigBySessionId(
  sessionId: string
): Promise<InterviewConfig | null> {
  const result = await query<ConfigRow>(
    `SELECT * FROM interview_configs 
     WHERE session_id = $1 AND deleted_at IS NULL`,
    [sessionId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return rowToConfig(result.rows[0]!);
}

/**
 * Get interview config by ID
 */
export async function getConfigById(
  configId: string
): Promise<InterviewConfig | null> {
  const result = await query<ConfigRow>(
    `SELECT * FROM interview_configs 
     WHERE id = $1 AND deleted_at IS NULL`,
    [configId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return rowToConfig(result.rows[0]!);
}

/**
 * Soft delete interview config
 */
export async function deleteConfig(sessionId: string): Promise<boolean> {
  const result = await query(
    `UPDATE interview_configs 
     SET deleted_at = NOW()
     WHERE session_id = $1 AND deleted_at IS NULL`,
    [sessionId]
  );

  return (result.rowCount ?? 0) > 0;
}
