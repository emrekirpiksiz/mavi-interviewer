import { config } from '../config/index.js';
import {
  getSessionById,
  updateSession,
  createSessionEvent,
  getClient,
} from '../db/queries/sessions.js';
import {
  getConfigBySessionId,
} from '../db/queries/configs.js';
import {
  getTranscriptBySessionId,
} from '../db/queries/transcripts.js';
import type {
  Session,
  AssessmentConfig,
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
  config: AssessmentConfig;
}

// ---------- Create Session ----------

export async function createInterviewSession(
  request: CreateSessionRequest
): Promise<CreateSessionResponse> {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const sessionResult = await client.query(
      `INSERT INTO sessions (status, current_phase, current_question_index, external_id, callback_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      ['pending', 'introduction', 0, request.externalId ?? null, request.callbackUrl ?? null]
    );
    const sessionRow = sessionResult.rows[0];

    await client.query(
      `INSERT INTO assessment_configs (session_id, assessment_data, questions_data, candidate_data, settings)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        sessionRow.id,
        JSON.stringify(request.assessment),
        JSON.stringify(request.questions),
        JSON.stringify(request.candidate),
        JSON.stringify(request.settings ?? {}),
      ]
    );

    await client.query(
      `INSERT INTO session_events (session_id, event_type)
       VALUES ($1, $2)`,
      [sessionRow.id, 'session_created']
    );

    await client.query('COMMIT');

    const baseUrl = config.frontendUrl || 'http://localhost:2222';
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

export async function getSession(
  sessionId: string
): Promise<GetSessionResponse | null> {
  const session = await getSessionById(sessionId);
  if (!session) {
    return null;
  }

  const assessmentConfig = await getConfigBySessionId(sessionId);
  if (!assessmentConfig) {
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
        name: assessmentConfig.candidateData.name,
      },
      assessment: {
        title: assessmentConfig.assessmentData.title,
      },
    },
  };
}

export async function getSessionWithConfig(
  sessionId: string
): Promise<SessionWithConfig | null> {
  const session = await getSessionById(sessionId);
  if (!session) {
    return null;
  }

  const assessmentConfig = await getConfigBySessionId(sessionId);
  if (!assessmentConfig) {
    return null;
  }

  return { session, config: assessmentConfig };
}

// ---------- Get Transcript ----------

export async function getSessionTranscript(
  sessionId: string
): Promise<GetTranscriptResponse | null> {
  const session = await getSessionById(sessionId);
  if (!session) {
    return null;
  }

  const assessmentConfig = await getConfigBySessionId(sessionId);
  if (!assessmentConfig) {
    return null;
  }

  const transcriptEntries = await getTranscriptBySessionId(sessionId);

  let totalMinutes = 0;
  if (session.startedAt && session.endedAt) {
    const start = new Date(session.startedAt).getTime();
    const end = new Date(session.endedAt).getTime();
    totalMinutes = Math.round((end - start) / 1000 / 60);
  }

  const entries: TranscriptEntryResponse[] = transcriptEntries.map((entry) => ({
    sequence: entry.sequenceNumber,
    speaker: entry.speaker,
    content: entry.content,
    phase: entry.phase,
    questionContext: entry.questionContext,
    timestampMs: entry.timestampMs,
  }));

  return {
    success: true,
    data: {
      sessionId: session.id,
      status: session.status,
      candidate: {
        name: assessmentConfig.candidateData.name,
      },
      assessment: {
        title: assessmentConfig.assessmentData.title,
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

export async function getInterviewConfig(
  sessionId: string
): Promise<AssessmentConfig | null> {
  return await getConfigBySessionId(sessionId);
}

// ---------- Re-exports ----------

export { getSessionById, updateSession, createSessionEvent };
export type { ConversationMessage } from '@ai-interview/shared';
