import { WebSocketServer, WebSocket, RawData } from 'ws';
import type { Server } from 'http';
import type { IncomingMessage } from 'http';
import { URL } from 'url';
import { connectionManager } from './connectionManager.js';
import { validateMessage, handleEvent, sendError as sendHandlerError, initializeSession, handleSessionDisconnect } from './handlers.js';
import { getSession, getInterviewConfig, createSessionEvent } from '../services/sessionService.js';
import { getTranscriptBySessionId } from '../db/queries/transcripts.js';
import { getSessionState } from '../services/stateMachine.js';
import type { 
  WSConnectionReadyEvent, 
  WSConnectionErrorEvent,
  SpeakerType,
} from '@ai-interview/shared';

// ============================================
// WEBSOCKET SERVER SETUP
// ============================================

const WS_CONNECTION_LIMIT = 10;
const WS_CONNECTION_WINDOW_MS = 60 * 1000;
const connectionAttempts = new Map<string, { count: number; resetAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of connectionAttempts.entries()) {
    if (now > data.resetAt) {
      connectionAttempts.delete(ip);
    }
  }
}, 5 * 60 * 1000);

function checkConnectionRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = connectionAttempts.get(ip);

  if (!entry || now > entry.resetAt) {
    connectionAttempts.set(ip, { count: 1, resetAt: now + WS_CONNECTION_WINDOW_MS });
    return true;
  }

  entry.count++;
  if (entry.count > WS_CONNECTION_LIMIT) {
    return false;
  }

  return true;
}

export function setupWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ 
    server,
    path: '/ws'
  });

  console.log('[WebSocket] Server initialized on path /ws');

  wss.on('connection', async (ws: WebSocket, request: IncomingMessage) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const sessionId = url.searchParams.get('sessionId');

    const ip = (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || request.socket.remoteAddress
      || 'unknown';

    console.log(`[WebSocket] New connection attempt - sessionId: ${sessionId}, IP: ${ip}`);

    if (!checkConnectionRateLimit(ip)) {
      console.warn(`[WebSocket] Connection rate limit exceeded for IP: ${ip}`);
      sendError(ws, 'RATE_LIMIT_EXCEEDED', 'Too many connection attempts');
      ws.close(4029, 'Rate limit exceeded');
      return;
    }

    if (!sessionId) {
      sendError(ws, 'MISSING_SESSION_ID', 'sessionId query parameter is required');
      ws.close(4001, 'Missing sessionId');
      return;
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sessionId)) {
      sendError(ws, 'INVALID_SESSION_ID', 'Invalid sessionId format');
      ws.close(4002, 'Invalid sessionId format');
      return;
    }

    try {
      const sessionResponse = await getSession(sessionId);

      if (!sessionResponse) {
        sendError(ws, 'SESSION_NOT_FOUND', 'Session not found');
        ws.close(4003, 'Session not found');
        return;
      }

      const session = sessionResponse.data;

      if (session.status === 'completed' || session.status === 'failed') {
        sendError(ws, 'SESSION_ENDED', `Session is already ${session.status}`);
        ws.close(4004, 'Session already ended');
        return;
      }

      const userAgent = (request.headers['user-agent'] as string) || '';

      const takeoverInfo = connectionManager.add(sessionId, ws, ip, userAgent);

      if (takeoverInfo.takeover) {
        createSessionEvent({
          sessionId,
          eventType: 'session_takeover',
          eventData: {
            oldIp: takeoverInfo.oldIp,
            newIp: ip,
            oldUserAgent: takeoverInfo.oldUserAgent,
            newUserAgent: userAgent,
          },
        }).catch(err => console.error('[WebSocket] Failed to log session_takeover:', err));
      }

      ws.on('message', (data) => {
        handleMessage(sessionId, ws, data).catch((error) => {
          console.error(`[WebSocket] Session ${sessionId} - Unhandled error:`, error);
        });
      });

      ws.on('close', async (code, reason) => {
        console.log(`[WebSocket] Session ${sessionId} - Connection closed (code: ${code})`);
        
        if (code !== 4010) {
          const lastState = getSessionState(sessionId)?.state;
          createSessionEvent({
            sessionId,
            eventType: 'connection_lost',
            eventData: { closeCode: code, closeReason: reason.toString(), lastState, ip, userAgent },
          }).catch(err => console.error('[WebSocket] Failed to log connection_lost:', err));
        }

        connectionManager.remove(sessionId);
        handleSessionDisconnect(sessionId, code);
      });

      ws.on('error', (error) => {
        console.error(`[WebSocket] Session ${sessionId} - Connection error:`, error);
        connectionManager.remove(sessionId);
      });

      const assessmentConfig = await getInterviewConfig(sessionId);

      const initResult = await initializeSession(sessionId);
      if (!initResult.success) {
        sendError(ws, 'SESSION_INIT_FAILED', 'Failed to initialize session');
        ws.close(4005, 'Session init failed');
        return;
      }

      const readyEvent: WSConnectionReadyEvent = {
        event: 'connection:ready',
        data: {
          sessionId: session.sessionId,
          status: session.status,
          currentPhase: session.currentPhase,
          currentQuestionIndex: session.currentQuestionIndex,
          candidate: session.candidate,
          assessment: session.assessment,
          totalQuestions: assessmentConfig?.questionsData?.length ?? 0,
          settings: assessmentConfig?.settings,
          isReconnect: initResult.isReconnect,
        }
      };

      if (initResult.isReconnect && session.status === 'active') {
        try {
          const transcriptEntries = await getTranscriptBySessionId(sessionId);
          if (transcriptEntries && transcriptEntries.length > 0) {
            readyEvent.data.existingTranscript = transcriptEntries.map(entry => ({
              speaker: entry.speaker as SpeakerType,
              content: entry.content,
              phase: entry.phase,
              timestamp: entry.timestampMs,
            }));
            
            if (session.startedAt) {
              const startTime = new Date(session.startedAt).getTime();
              readyEvent.data.elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
            }
          }
        } catch (error) {
          console.error(`[WebSocket] Session ${sessionId} - Error loading transcript for reconnect:`, error);
        }

        const connInfo = connectionManager.get(sessionId);
        createSessionEvent({
          sessionId,
          eventType: 'connection_restored',
          eventData: { ip, userAgent, reconnectNumber: connInfo?.reconnectCount ?? 0 },
        }).catch(err => console.error('[WebSocket] Failed to log connection_restored:', err));
      } else {
        createSessionEvent({
          sessionId,
          eventType: 'connection_established',
          eventData: { ip, userAgent, isReconnect: false },
        }).catch(err => console.error('[WebSocket] Failed to log connection_established:', err));
      }

      ws.send(JSON.stringify(readyEvent));
      console.log(`[WebSocket] Session ${sessionId} - connection:ready sent (isReconnect: ${initResult.isReconnect})`);

    } catch (error) {
      console.error(`[WebSocket] Session ${sessionId} - Error during connection setup:`, error);
      sendError(ws, 'INTERNAL_ERROR', 'Internal server error');
      ws.close(4500, 'Internal server error');
    }
  });

  wss.on('error', (error) => {
    console.error('[WebSocket] Server error:', error);
  });

  return wss;
}

async function handleMessage(sessionId: string, ws: WebSocket, data: RawData): Promise<void> {
  try {
    const parsed = JSON.parse(data.toString());
    console.log(`[WebSocket] Session ${sessionId} - Received:`, parsed.event);

    const validation = validateMessage(parsed);
    
    if (!validation.valid) {
      console.warn(`[WebSocket] Session ${sessionId} - Invalid message: ${validation.error}`);
      sendHandlerError(ws, 'INVALID_MESSAGE', validation.error, true);
      return;
    }

    await handleEvent(sessionId, ws, validation.message);

  } catch (error) {
    console.error(`[WebSocket] Session ${sessionId} - Error handling message:`, error);
    sendError(ws, 'INVALID_MESSAGE', 'Invalid JSON format');
  }
}

function sendError(ws: WebSocket, code: string, message: string): void {
  const errorEvent: WSConnectionErrorEvent = {
    event: 'connection:error',
    data: { code, message }
  };
  
  try {
    ws.send(JSON.stringify(errorEvent));
  } catch (error) {
    console.error('[WebSocket] Error sending error event:', error);
  }
}
