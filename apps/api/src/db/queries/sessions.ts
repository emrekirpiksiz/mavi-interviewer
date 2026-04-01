import { query, getClient } from '../index.js';
import type { Session, SessionStatus, InterviewPhase } from '@ai-interview/shared';

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
  current_phase: InterviewPhase;
  current_question_index: number;
  started_at: Date | null;
  ended_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  // Session persistence fields
  conversation_history: ConversationMessage[] | null;
  last_ai_message: string | null;
  phase_question_counts: Record<InterviewPhase, number> | null;
  interview_state: string | null;
}

interface CreateSessionParams {
  status?: SessionStatus;
  currentPhase?: InterviewPhase;
  currentQuestionIndex?: number;
}

interface UpdateSessionParams {
  status?: SessionStatus;
  currentPhase?: InterviewPhase;
  currentQuestionIndex?: number;
  startedAt?: Date | null;
  endedAt?: Date | null;
  // Session persistence fields
  conversationHistory?: ConversationMessage[];
  lastAiMessage?: string | null;
  phaseQuestionCounts?: Record<InterviewPhase, number>;
  interviewState?: string;
}

// ---------- Helpers ----------

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    status: row.status,
    currentPhase: row.current_phase,
    currentQuestionIndex: row.current_question_index,
    startedAt: row.started_at?.toISOString() ?? null,
    endedAt: row.ended_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    deletedAt: row.deleted_at?.toISOString() ?? null,
    // Session persistence fields
    conversationHistory: row.conversation_history ?? undefined,
    lastAiMessage: row.last_ai_message ?? undefined,
    phaseQuestionCounts: row.phase_question_counts ?? undefined,
    interviewState: row.interview_state ?? undefined,
  };
}

// ---------- Queries ----------

/**
 * Create a new session
 */
export async function createSession(
  params: CreateSessionParams = {}
): Promise<Session> {
  const {
    status = 'pending',
    currentPhase = 'introduction',
    currentQuestionIndex = 0,
  } = params;

  const result = await query<SessionRow>(
    `INSERT INTO sessions (status, current_phase, current_question_index)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [status, currentPhase, currentQuestionIndex]
  );

  return rowToSession(result.rows[0]!);
}

/**
 * Get a session by ID
 */
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

/**
 * Update a session
 */
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

  // Session persistence fields
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

  // Always update updated_at
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

/**
 * Soft delete a session
 */
export async function deleteSession(sessionId: string): Promise<boolean> {
  const result = await query(
    `UPDATE sessions 
     SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL`,
    [sessionId]
  );

  return (result.rowCount ?? 0) > 0;
}

/**
 * Get sessions by status
 */
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

/**
 * Create a session event (audit log)
 */
export async function createSessionEvent(
  params: CreateSessionEventParams
): Promise<void> {
  await query(
    `INSERT INTO session_events (session_id, event_type, event_data)
     VALUES ($1, $2, $3)`,
    [params.sessionId, params.eventType, params.eventData ?? null]
  );
}

// ---------- Recording Status ----------

/**
 * Update session recording status and optionally recording URL
 */
export async function updateSessionRecordingStatus(
  sessionId: string,
  status: string,
  recordingUrl?: string
): Promise<void> {
  if (recordingUrl) {
    await query(
      'UPDATE sessions SET recording_status = $1, recording_url = $2, updated_at = NOW() WHERE id = $3',
      [status, recordingUrl, sessionId]
    );
  } else {
    await query(
      'UPDATE sessions SET recording_status = $1, updated_at = NOW() WHERE id = $2',
      [status, sessionId]
    );
  }
}

// ---------- Video Recording Status ----------

export async function updateSessionVideoRecordingStatus(
  sessionId: string,
  status: string,
  videoUrl?: string
): Promise<void> {
  if (videoUrl) {
    await query(
      'UPDATE sessions SET video_recording_status = $1, video_recording_url = $2, updated_at = NOW() WHERE id = $3',
      [status, videoUrl, sessionId]
    );
  } else {
    await query(
      'UPDATE sessions SET video_recording_status = $1, updated_at = NOW() WHERE id = $2',
      [status, sessionId]
    );
  }
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

// ---------- Transaction Helper ----------

export { getClient };
