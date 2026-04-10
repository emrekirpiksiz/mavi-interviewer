import { query } from '../index.js';
import type { AssessmentConfig, Assessment, AssessmentQuestion, AssessmentCandidate, AssessmentSettings } from '@ai-interview/shared';

// ============================================
// ASSESSMENT CONFIG DATABASE QUERIES
// ============================================

// ---------- Types ----------

interface ConfigRow {
  id: string;
  session_id: string;
  assessment_data: Assessment;
  questions_data: AssessmentQuestion[];
  candidate_data: AssessmentCandidate;
  settings: AssessmentSettings | null;
  created_at: Date;
  deleted_at: Date | null;
}

interface CreateConfigParams {
  sessionId: string;
  assessmentData: Assessment;
  questionsData: AssessmentQuestion[];
  candidateData: AssessmentCandidate;
  settings?: AssessmentSettings;
}

// ---------- Helpers ----------

function rowToConfig(row: ConfigRow): AssessmentConfig {
  return {
    id: row.id,
    sessionId: row.session_id,
    assessmentData: row.assessment_data,
    questionsData: row.questions_data,
    candidateData: row.candidate_data,
    settings: row.settings ?? undefined,
    createdAt: row.created_at.toISOString(),
    deletedAt: row.deleted_at?.toISOString() ?? null,
  };
}

// ---------- Queries ----------

export async function createConfig(
  params: CreateConfigParams
): Promise<AssessmentConfig> {
  const result = await query<ConfigRow>(
    `INSERT INTO assessment_configs (session_id, assessment_data, questions_data, candidate_data, settings)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      params.sessionId,
      JSON.stringify(params.assessmentData),
      JSON.stringify(params.questionsData),
      JSON.stringify(params.candidateData),
      JSON.stringify(params.settings ?? {}),
    ]
  );

  return rowToConfig(result.rows[0]!);
}

export async function getConfigBySessionId(
  sessionId: string
): Promise<AssessmentConfig | null> {
  const result = await query<ConfigRow>(
    `SELECT * FROM assessment_configs 
     WHERE session_id = $1 AND deleted_at IS NULL`,
    [sessionId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return rowToConfig(result.rows[0]!);
}

export async function getConfigById(
  configId: string
): Promise<AssessmentConfig | null> {
  const result = await query<ConfigRow>(
    `SELECT * FROM assessment_configs 
     WHERE id = $1 AND deleted_at IS NULL`,
    [configId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return rowToConfig(result.rows[0]!);
}

export async function deleteConfig(sessionId: string): Promise<boolean> {
  const result = await query(
    `UPDATE assessment_configs 
     SET deleted_at = NOW()
     WHERE session_id = $1 AND deleted_at IS NULL`,
    [sessionId]
  );

  return (result.rowCount ?? 0) > 0;
}
