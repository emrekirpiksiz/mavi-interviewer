import { query, getClient } from '../index.js';
import type { Session, SessionStatus, AssessmentPhase } from '@ai-interview/shared';

// ============================================
// SESSION DATABASE QUERIES
// ============================================

// ---------- Types ----------

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface SessionRow {
  id: string;
  status: SessionStatus;
  current_phase: AssessmentPhase;
  current_question_index: number;
  external_id: string | null;
  callback_url: string | null;
  started_at: Date | null;
  ended_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  conversation_history: ConversationMessage[] | null;
  last_ai_message: string | null;
  phase_question_counts: Record<AssessmentPhase, number> | null;
  interview_state: string | null;
}

interface UpdateSessionParams {
  status?: SessionStatus;
  currentPhase?: AssessmentPhase;
  currentQuestionIndex?: number;
  startedAt?: Date | null;
  endedAt?: Date | null;
  conversationHistory?: ConversationMessage[];
  lastAiMessage?: string | null;
  phaseQuestionCounts?: Record<AssessmentPhase, number>;
  interviewState?: string;
}

// ---------- Helpers ----------

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    status: row.status,
    currentPhase: row.current_phase,
    currentQuestionIndex: row.current_question_index,
    externalId: row.external_id,
    callbackUrl: row.callback_url,
    startedAt: row.started_at?.toISOString() ?? null,
    endedAt: row.ended_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    deletedAt: row.deleted_at?.toISOString() ?? null,
    conversationHistory: row.conversation_history ?? undefined,
    lastAiMessage: row.last_ai_message ?? undefined,
    phaseQuestionCounts: row.phase_question_counts ?? undefined,
    interviewState: row.interview_state ?? undefined,
  };
}

// ---------- Queries ----------

export async function getSessionById(
  sessionId: string
): Promise<Session | null> {
  const result = await query<SessionRow>(
    `SELECT * FROM sessions 
     WHERE id = $1 AND deleted_at IS NULL`,
    [sessionId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return rowToSession(result.rows[0]!);
}

export async function updateSession(
  sessionId: string,
  params: UpdateSessionParams
): Promise<Session | null> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (params.status !== undefined) {
    updates.push(`status = $${paramIndex++}`);
    values.push(params.status);
  }

  if (params.currentPhase !== undefined) {
    updates.push(`current_phase = $${paramIndex++}`);
    values.push(params.currentPhase);
  }

  if (params.currentQuestionIndex !== undefined) {
    updates.push(`current_question_index = $${paramIndex++}`);
    values.push(params.currentQuestionIndex);
  }

  if (params.startedAt !== undefined) {
    updates.push(`started_at = $${paramIndex++}`);
    values.push(params.startedAt);
  }

  if (params.endedAt !== undefined) {
    updates.push(`ended_at = $${paramIndex++}`);
    values.push(params.endedAt);
  }

  if (params.conversationHistory !== undefined) {
    updates.push(`conversation_history = $${paramIndex++}`);
    values.push(JSON.stringify(params.conversationHistory));
  }

  if (params.lastAiMessage !== undefined) {
    updates.push(`last_ai_message = $${paramIndex++}`);
    values.push(params.lastAiMessage);
  }

  if (params.phaseQuestionCounts !== undefined) {
    updates.push(`phase_question_counts = $${paramIndex++}`);
    values.push(JSON.stringify(params.phaseQuestionCounts));
  }

  if (params.interviewState !== undefined) {
    updates.push(`interview_state = $${paramIndex++}`);
    values.push(params.interviewState);
  }

  if (updates.length === 0) {
    return getSessionById(sessionId);
  }

  updates.push(`updated_at = NOW()`);
  values.push(sessionId);

  const result = await query<SessionRow>(
    `UPDATE sessions 
     SET ${updates.join(', ')}
     WHERE id = $${paramIndex} AND deleted_at IS NULL
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    return null;
  }

  return rowToSession(result.rows[0]!);
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  const result = await query(
    `UPDATE sessions 
     SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL`,
    [sessionId]
  );

  return (result.rowCount ?? 0) > 0;
}

export async function getSessionsByStatus(
  status: SessionStatus
): Promise<Session[]> {
  const result = await query<SessionRow>(
    `SELECT * FROM sessions 
     WHERE status = $1 AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [status]
  );

  return result.rows.map((row) => rowToSession(row));
}

// ---------- Session Events ----------

interface CreateSessionEventParams {
  sessionId: string;
  eventType: string;
  eventData?: Record<string, unknown> | null;
}

export async function createSessionEvent(
  params: CreateSessionEventParams
): Promise<void> {
  await query(
    `INSERT INTO session_events (session_id, event_type, event_data)
     VALUES ($1, $2, $3)`,
    [params.sessionId, params.eventType, params.eventData ?? null]
  );
}

// ---------- Camera Violation Events ----------

interface CameraEventRow {
  event_type: string;
  event_data: { type: string; timestamp: number; interviewSecond: number | null } | null;
  created_at: Date;
}

export async function getCameraViolationEvents(sessionId: string): Promise<CameraEventRow[]> {
  const result = await query<CameraEventRow>(
    `SELECT event_type, event_data, created_at
     FROM session_events
     WHERE session_id = $1
       AND event_type IN ('camera_face_lost', 'camera_gaze_away', 'camera_multi_face')
     ORDER BY created_at ASC`,
    [sessionId]
  );
  return result.rows;
}

// ---------- Media URL Queries ----------

interface MediaEventRow {
  event_type: string;
  event_data: { recordingUrl?: string; videoUrl?: string } | null;
}

export async function getMediaUrls(sessionId: string): Promise<{ audioUrl: string | null; videoUrl: string | null }> {
  const result = await query<MediaEventRow>(
    `SELECT event_type, event_data
     FROM session_events
     WHERE session_id = $1
       AND event_data IS NOT NULL
       AND (event_data->>'recordingUrl' IS NOT NULL OR event_data->>'videoUrl' IS NOT NULL)
     ORDER BY created_at DESC`,
    [sessionId]
  );

  let audioUrl: string | null = null;
  let videoUrl: string | null = null;

  for (const row of result.rows) {
    if (!audioUrl && row.event_data?.recordingUrl) {
      audioUrl = row.event_data.recordingUrl;
    }
    if (!videoUrl && row.event_data?.videoUrl) {
      videoUrl = row.event_data.videoUrl;
    }
  }

  return { audioUrl, videoUrl };
}

// ---------- Transaction Helper ----------

export { getClient };
