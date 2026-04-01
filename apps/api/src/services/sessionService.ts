import { config } from '../config/index.js';
import {
  createSession,
  getSessionById,
  updateSession,
  createSessionEvent,
  getClient,
} from '../db/queries/sessions.js';
import {
  createConfig,
  getConfigBySessionId,
} from '../db/queries/configs.js';
import {
  getTranscriptBySessionId,
} from '../db/queries/transcripts.js';
import type {
  Session,
  InterviewConfig,
  Position,
  Candidate,
  InterviewTopic,
  TranscriptEntry,
  CreateSessionRequest,
  CreateSessionResponse,
  GetSessionResponse,
  GetTranscriptResponse,
  TranscriptEntryResponse,
} from '@ai-interview/shared';

// ============================================
// SESSION SERVICE
// ============================================

interface SessionWithConfig {
  session: Session;
  config: InterviewConfig;
}

// ---------- Create Session ----------

/**
 * Create a new interview session with config
 * Called by ATS via POST /sessions
 */
export async function createInterviewSession(
  request: CreateSessionRequest
): Promise<CreateSessionResponse> {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // 1. Create session
    const sessionResult = await client.query(
      `INSERT INTO sessions (status, current_phase, current_question_index)
       VALUES ($1, $2, $3)
       RETURNING *`,
      ['pending', 'introduction', 0]
    );
    const sessionRow = sessionResult.rows[0];

    // 2. Create interview config
    await client.query(
      `INSERT INTO interview_configs (session_id, position_data, candidate_data, topics, settings)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        sessionRow.id,
        JSON.stringify(request.position),
        JSON.stringify(request.candidate),
        JSON.stringify(request.interview_topics),
        JSON.stringify(request.settings ?? {}),
      ]
    );

    // 3. Log session created event
    await client.query(
      `INSERT INTO session_events (session_id, event_type)
       VALUES ($1, $2)`,
      [sessionRow.id, 'session_created']
    );

    await client.query('COMMIT');

    // Build join URL
    const baseUrl = config.frontendUrl || 'http://localhost:3000';
    const joinUrl = `${baseUrl}/interview/${sessionRow.id}`;

    return {
      success: true,
      data: {
        sessionId: sessionRow.id,
        joinUrl,
        status: sessionRow.status,
        createdAt: sessionRow.created_at.toISOString(),
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ---------- Get Session ----------

/**
 * Get session details for display
 * Returns summary info (not full config)
 */
export async function getSession(
  sessionId: string
): Promise<GetSessionResponse | null> {
  const session = await getSessionById(sessionId);
  if (!session) {
    return null;
  }

  const config = await getConfigBySessionId(sessionId);
  if (!config) {
    return null;
  }

  return {
    success: true,
    data: {
      sessionId: session.id,
      status: session.status,
      currentPhase: session.currentPhase,
      currentQuestionIndex: session.currentQuestionIndex,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      createdAt: session.createdAt,
      candidate: {
        name: config.candidateData.name,
      },
      position: {
        title: config.positionData.title,
        company: config.positionData.company.name,
      },
    },
  };
}

/**
 * Get full session with config
 * Used internally for interview engine
 */
export async function getSessionWithConfig(
  sessionId: string
): Promise<SessionWithConfig | null> {
  const session = await getSessionById(sessionId);
  if (!session) {
    return null;
  }

  const config = await getConfigBySessionId(sessionId);
  if (!config) {
    return null;
  }

  return { session, config };
}

// ---------- Get Transcript ----------

/**
 * Get transcript for a completed session
 */
export async function getSessionTranscript(
  sessionId: string
): Promise<GetTranscriptResponse | null> {
  const session = await getSessionById(sessionId);
  if (!session) {
    return null;
  }

  const interviewConfig = await getConfigBySessionId(sessionId);
  if (!interviewConfig) {
    return null;
  }

  const transcriptEntries = await getTranscriptBySessionId(sessionId);

  // Calculate duration
  let totalMinutes = 0;
  if (session.startedAt && session.endedAt) {
    const start = new Date(session.startedAt).getTime();
    const end = new Date(session.endedAt).getTime();
    totalMinutes = Math.round((end - start) / 1000 / 60);
  }

  // Map entries to response format
  const entries: TranscriptEntryResponse[] = transcriptEntries.map((entry) => ({
    sequence: entry.sequenceNumber,
    speaker: entry.speaker,
    content: entry.content,
    phase: entry.phase,
    topic: entry.questionContext,
    timestampMs: entry.timestampMs,
  }));

  return {
    success: true,
    data: {
      sessionId: session.id,
      status: session.status,
      candidate: {
        name: interviewConfig.candidateData.name,
      },
      position: {
        title: interviewConfig.positionData.title,
        company: interviewConfig.positionData.company.name,
      },
      duration: {
        startedAt: session.startedAt || '',
        endedAt: session.endedAt || '',
        totalMinutes,
      },
      entries,
    },
  };
}

// ---------- Update Session ----------

/**
 * Start an interview session
 */
export async function startSession(sessionId: string): Promise<Session | null> {
  const session = await updateSession(sessionId, {
    status: 'active',
    startedAt: new Date(),
  });

  if (session) {
    await createSessionEvent({
      sessionId,
      eventType: 'session_started',
    });
  }

  return session;
}

/**
 * End an interview session
 */
export async function endSession(
  sessionId: string,
  reason: 'completed' | 'candidate_left' | 'technical_error' = 'completed'
): Promise<Session | null> {
  const status = reason === 'completed' ? 'completed' : 'failed';

  const session = await updateSession(sessionId, {
    status,
    endedAt: new Date(),
  });

  if (session) {
    await createSessionEvent({
      sessionId,
      eventType: 'session_ended',
      eventData: { reason },
    });
  }

  return session;
}

/**
 * Update session phase
 */
export async function updateSessionPhase(
  sessionId: string,
  phase: Session['currentPhase'],
  questionIndex: number = 0
): Promise<Session | null> {
  const currentSession = await getSessionById(sessionId);
  if (!currentSession) {
    return null;
  }

  const session = await updateSession(sessionId, {
    currentPhase: phase,
    currentQuestionIndex: questionIndex,
  });

  if (session) {
    await createSessionEvent({
      sessionId,
      eventType: 'phase_changed',
      eventData: {
        from: currentSession.currentPhase,
        to: phase,
      },
    });
  }

  return session;
}

// ---------- Get Interview Config ----------

/**
 * Get interview config for a session
 * Used by WebSocket for connection:ready event
 */
export async function getInterviewConfig(
  sessionId: string
): Promise<InterviewConfig | null> {
  return await getConfigBySessionId(sessionId);
}

// ---------- Re-exports for convenience ----------

export { getSessionById, updateSession, createSessionEvent };

// Re-export ConversationMessage type
export type { ConversationMessage } from '@ai-interview/shared';
