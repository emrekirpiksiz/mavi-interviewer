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
  InterviewPhase,
  SpeakerType,
} from '@ai-interview/shared';

// ============================================
// WEBSOCKET SERVER SETUP
// ============================================

const PHASES: InterviewPhase[] = [
  'introduction',
  'experience',
  'technical',
  'behavioral',
  'motivation',
  'closing'
];

// ============================================
// WEBSOCKET RATE LIMITING
// ============================================

// IP bazlı bağlantı rate limiting
const WS_CONNECTION_LIMIT = 10; // per minute per IP
const WS_CONNECTION_WINDOW_MS = 60 * 1000;
const connectionAttempts = new Map<string, { count: number; resetAt: number }>();

// Periyodik temizlik (her 5 dakikada expired entry'leri temizle)
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of connectionAttempts.entries()) {
    if (now > data.resetAt) {
      connectionAttempts.delete(ip);
    }
  }
}, 5 * 60 * 1000);

/**
 * IP bazlı WebSocket bağlantı rate limiting kontrolü
 */
function checkConnectionRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = connectionAttempts.get(ip);

  if (!entry || now > entry.resetAt) {
    // Yeni pencere başlat
    connectionAttempts.set(ip, { count: 1, resetAt: now + WS_CONNECTION_WINDOW_MS });
    return true;
  }

  entry.count++;
  if (entry.count > WS_CONNECTION_LIMIT) {
    return false; // Limit aşıldı
  }

  return true;
}

/**
 * Setup WebSocket server on existing HTTP server
 */
export function setupWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ 
    server,
    path: '/ws'
  });

  console.log('[WebSocket] Server initialized on path /ws');

  wss.on('connection', async (ws: WebSocket, request: IncomingMessage) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const sessionId = url.searchParams.get('sessionId');

    // IP adresini al (proxy arkasındaysa x-forwarded-for)
    const ip = (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || request.socket.remoteAddress
      || 'unknown';

    console.log(`[WebSocket] New connection attempt - sessionId: ${sessionId}, IP: ${ip}`);

    // Bağlantı rate limiting kontrolü
    if (!checkConnectionRateLimit(ip)) {
      console.warn(`[WebSocket] Connection rate limit exceeded for IP: ${ip}`);
      sendError(ws, 'RATE_LIMIT_EXCEEDED', 'Too many connection attempts');
      ws.close(4029, 'Rate limit exceeded');
      return;
    }

    // Validate sessionId
    if (!sessionId) {
      sendError(ws, 'MISSING_SESSION_ID', 'sessionId query parameter is required');
      ws.close(4001, 'Missing sessionId');
      return;
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sessionId)) {
      sendError(ws, 'INVALID_SESSION_ID', 'Invalid sessionId format');
      ws.close(4002, 'Invalid sessionId format');
      return;
    }

    try {
      // Check if session exists and is valid
      const sessionResponse = await getSession(sessionId);

      if (!sessionResponse) {
        sendError(ws, 'SESSION_NOT_FOUND', 'Session not found');
        ws.close(4003, 'Session not found');
        return;
      }

      const session = sessionResponse.data;

      // Check if session is in a valid state for connection
      if (session.status === 'completed' || session.status === 'failed') {
        sendError(ws, 'SESSION_ENDED', `Session is already ${session.status}`);
        ws.close(4004, 'Session already ended');
        return;
      }

      // Get user agent
      const userAgent = (request.headers['user-agent'] as string) || '';

      // Register connection (handles single connection policy, returns takeover info)
      const takeoverInfo = connectionManager.add(sessionId, ws, ip, userAgent);

      // Log session takeover if applicable
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

      // Setup event handlers FIRST (before any async operations)
      ws.on('message', (data) => {
        handleMessage(sessionId, ws, data).catch((error) => {
          console.error(`[WebSocket] Session ${sessionId} - Unhandled error in message handler:`, error);
        });
      });

      ws.on('close', async (code, reason) => {
        console.log(`[WebSocket] Session ${sessionId} - Connection closed (code: ${code}, reason: ${reason.toString()})`);
        
        // Takeover durumunda (4010) loglama yapma - takeover zaten loglandı
        if (code !== 4010) {
          const lastState = getSessionState(sessionId)?.state;
          createSessionEvent({
            sessionId,
            eventType: 'connection_lost',
            eventData: {
              closeCode: code,
              closeReason: reason.toString(),
              lastState,
              ip,
              userAgent,
            },
          }).catch(err => console.error('[WebSocket] Failed to log connection_lost:', err));
        }

        connectionManager.remove(sessionId);
        // Koşullu cleanup: aktif session'ların state'ini silme (reconnect için)
        handleSessionDisconnect(sessionId, code);
      });

      ws.on('error', (error) => {
        console.error(`[WebSocket] Session ${sessionId} - Connection error:`, error);
        connectionManager.remove(sessionId);
      });

      // Get interview config for the session
      const config = await getInterviewConfig(sessionId);

      // Initialize session state for interview engine (check for reconnect)
      const initResult = await initializeSession(sessionId);
      if (!initResult.success) {
        sendError(ws, 'SESSION_INIT_FAILED', 'Failed to initialize session');
        ws.close(4005, 'Session init failed');
        return;
      }

      // Build connection:ready event
      const readyEvent: WSConnectionReadyEvent = {
        event: 'connection:ready',
        data: {
          sessionId: session.sessionId,
          status: session.status,
          currentPhase: session.currentPhase,
          currentQuestionIndex: session.currentQuestionIndex,
          candidate: session.candidate,
          position: session.position,
          config: {
            phases: PHASES
          },
          settings: config?.settings,
          isReconnect: initResult.isReconnect,
        }
      };

      // If this is a reconnect, load existing transcript
      if (initResult.isReconnect && session.status === 'active') {
        try {
          // Direkt transcript_entries tablosundan oku (getSessionTranscript sadece completed sessions içindir)
          const transcriptEntries = await getTranscriptBySessionId(sessionId);
          if (transcriptEntries && transcriptEntries.length > 0) {
            readyEvent.data.existingTranscript = transcriptEntries.map(entry => ({
              speaker: entry.speaker as SpeakerType,
              content: entry.content,
              phase: entry.phase,
              timestamp: entry.timestampMs,
            }));
            
            // Calculate elapsed time
            if (session.startedAt) {
              const startTime = new Date(session.startedAt).getTime();
              readyEvent.data.elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
            }
            
            console.log(`[WebSocket] Session ${sessionId} - Reconnect with ${readyEvent.data.existingTranscript.length} transcript entries`);
          }
        } catch (error) {
          console.error(`[WebSocket] Session ${sessionId} - Error loading transcript for reconnect:`, error);
        }

        // Log connection_restored event
        const connInfo = connectionManager.get(sessionId);
        createSessionEvent({
          sessionId,
          eventType: 'connection_restored',
          eventData: {
            ip,
            userAgent,
            reconnectNumber: connInfo?.reconnectCount ?? 0,
          },
        }).catch(err => console.error('[WebSocket] Failed to log connection_restored:', err));
      } else {
        // Log initial connection_established event
        createSessionEvent({
          sessionId,
          eventType: 'connection_established',
          eventData: {
            ip,
            userAgent,
            isReconnect: false,
          },
        }).catch(err => console.error('[WebSocket] Failed to log connection_established:', err));
      }

      ws.send(JSON.stringify(readyEvent));
      console.log(`[WebSocket] Session ${sessionId} - connection:ready sent (isReconnect: ${initResult.isReconnect})`);
      console.log(`[WebSocket] Session ${sessionId} - State machine initialized`);

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

/**
 * Handle incoming WebSocket message
 */
async function handleMessage(sessionId: string, ws: WebSocket, data: RawData): Promise<void> {
  try {
    const parsed = JSON.parse(data.toString());
    console.log(`[WebSocket] Session ${sessionId} - Received:`, parsed.event);

    // Validate message
    const validation = validateMessage(parsed);
    
    if (!validation.valid) {
      console.warn(`[WebSocket] Session ${sessionId} - Invalid message: ${validation.error}`);
      sendHandlerError(ws, 'INVALID_MESSAGE', validation.error, true);
      return;
    }

    // Handle the validated event
    await handleEvent(sessionId, ws, validation.message);

  } catch (error) {
    console.error(`[WebSocket] Session ${sessionId} - Error handling message:`, error);
    sendError(ws, 'INVALID_MESSAGE', 'Invalid JSON format');
  }
}

/**
 * Send error event to client
 */
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
