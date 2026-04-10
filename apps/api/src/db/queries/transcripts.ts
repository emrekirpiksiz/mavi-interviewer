import { query } from '../index.js';
import type { TranscriptEntry, SpeakerType, AssessmentPhase } from '@ai-interview/shared';

// ============================================
// TRANSCRIPT DATABASE QUERIES
// ============================================

// ---------- Types ----------

interface TranscriptRow {
  id: string;
  session_id: string;
  sequence_number: number;
  speaker: SpeakerType;
  content: string;
  phase: AssessmentPhase;
  question_context: string | null;
  timestamp_ms: string;
  created_at: Date;
  deleted_at: Date | null;
}

interface CreateTranscriptParams {
  sessionId: string;
  sequenceNumber: number;
  speaker: SpeakerType;
  content: string;
  phase: AssessmentPhase;
  questionContext?: string | null;
  timestampMs: number;
}

// ---------- Helpers ----------

function rowToTranscript(row: TranscriptRow): TranscriptEntry {
  return {
    id: row.id,
    sessionId: row.session_id,
    sequenceNumber: row.sequence_number,
    speaker: row.speaker,
    content: row.content,
    phase: row.phase,
    questionContext: row.question_context,
    timestampMs: parseInt(row.timestamp_ms, 10),
    createdAt: row.created_at.toISOString(),
    deletedAt: row.deleted_at?.toISOString() ?? null,
  };
}

// ---------- Queries ----------

export async function createTranscriptEntry(
  params: CreateTranscriptParams
): Promise<TranscriptEntry> {
  const result = await query<TranscriptRow>(
    `INSERT INTO transcript_entries 
     (session_id, sequence_number, speaker, content, phase, question_context, timestamp_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      params.sessionId,
      params.sequenceNumber,
      params.speaker,
      params.content,
      params.phase,
      params.questionContext ?? null,
      params.timestampMs,
    ]
  );

  return rowToTranscript(result.rows[0]!);
}

export async function getTranscriptBySessionId(
  sessionId: string
): Promise<TranscriptEntry[]> {
  const result = await query<TranscriptRow>(
    `SELECT * FROM transcript_entries 
     WHERE session_id = $1 AND deleted_at IS NULL
     ORDER BY sequence_number ASC`,
    [sessionId]
  );

  return result.rows.map(rowToTranscript);
}

export async function getLastSequenceNumber(
  sessionId: string
): Promise<number> {
  const result = await query<{ max: string | null }>(
    `SELECT MAX(sequence_number) as max FROM transcript_entries 
     WHERE session_id = $1 AND deleted_at IS NULL`,
    [sessionId]
  );

  return result.rows[0]?.max ? parseInt(result.rows[0].max, 10) : 0;
}

export async function getLastTranscriptEntry(
  sessionId: string
): Promise<TranscriptEntry | null> {
  const result = await query<TranscriptRow>(
    `SELECT * FROM transcript_entries 
     WHERE session_id = $1 AND deleted_at IS NULL
     ORDER BY sequence_number DESC
     LIMIT 1`,
    [sessionId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return rowToTranscript(result.rows[0]!);
}

export async function deleteTranscriptBySessionId(
  sessionId: string
): Promise<boolean> {
  const result = await query(
    `UPDATE transcript_entries 
     SET deleted_at = NOW()
     WHERE session_id = $1 AND deleted_at IS NULL`,
    [sessionId]
  );

  return (result.rowCount ?? 0) > 0;
}
