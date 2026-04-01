/**
 * Session Logger - Debug için tüm önemli event'leri loglar
 * Clipboard'a kopyalanabilir format
 */

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';
export type LogSource = 
  | 'websocket' 
  | 'simli' 
  | 'whisper' 
  | 'interview' 
  | 'audio' 
  | 'network'
  | 'state'
  | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  source: LogSource;
  event: string;
  data?: unknown;
}

interface SessionLoggerState {
  logs: LogEntry[];
  sessionId: string | null;
  startTime: number | null;
}

const state: SessionLoggerState = {
  logs: [],
  sessionId: null,
  startTime: null,
};

const MAX_LOGS = 500; // Bellek taşmasını önle

/**
 * Logger'ı başlat
 */
export function initLogger(sessionId: string): void {
  state.logs = [];
  state.sessionId = sessionId;
  state.startTime = Date.now();
  
  log('info', 'interview', 'logger:init', { sessionId });
}

/**
 * Log ekle
 */
export function log(
  level: LogLevel,
  source: LogSource,
  event: string,
  data?: unknown
): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    source,
    event,
    data: data !== undefined ? sanitizeData(data) : undefined,
  };
  
  state.logs.push(entry);
  
  // Max log limitini aş
  if (state.logs.length > MAX_LOGS) {
    state.logs = state.logs.slice(-MAX_LOGS);
  }
  
  // Console'a da yaz (development için)
  const prefix = `[${source.toUpperCase()}]`;
  const message = `${prefix} ${event}`;
  
  switch (level) {
    case 'error':
      console.error(message, data ?? '');
      break;
    case 'warn':
      console.warn(message, data ?? '');
      break;
    case 'debug':
      console.debug(message, data ?? '');
      break;
    default:
      console.log(message, data ?? '');
  }
}

/**
 * WebSocket event'lerini logla
 */
export function logWS(direction: 'in' | 'out', event: string, data?: unknown): void {
  const eventName = direction === 'in' ? `ws:received:${event}` : `ws:sent:${event}`;
  log('info', 'websocket', eventName, data);
}

/**
 * State değişikliğini logla
 */
export function logState(stateName: string, oldValue: unknown, newValue: unknown): void {
  log('debug', 'state', `state:changed:${stateName}`, { from: oldValue, to: newValue });
}

/**
 * Hata logla
 */
export function logError(source: LogSource, error: unknown, context?: string): void {
  const errorData = error instanceof Error 
    ? { message: error.message, stack: error.stack }
    : { error };
  
  log('error', source, context ? `error:${context}` : 'error', errorData);
}

/**
 * Network metric logla
 */
export function logMetric(service: string, operation: string, durationMs: number, extra?: unknown): void {
  log('info', 'network', `metric:${service}:${operation}`, { durationMs, ...extra as object });
}

/**
 * Tüm logları al
 */
export function getLogs(): LogEntry[] {
  return [...state.logs];
}

/**
 * Logları temizle
 */
export function clearLogs(): void {
  state.logs = [];
}

/**
 * Logları clipboard'a kopyalanabilir formatta getir
 */
export function exportLogs(): string {
  const sessionDuration = state.startTime 
    ? Math.round((Date.now() - state.startTime) / 1000)
    : 0;
  
  const exportData = {
    meta: {
      sessionId: state.sessionId,
      exportTime: new Date().toISOString(),
      sessionDurationSeconds: sessionDuration,
      totalLogs: state.logs.length,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    },
    summary: generateSummary(),
    logs: state.logs,
  };
  
  return JSON.stringify(exportData, null, 2);
}

/**
 * Log özeti oluştur
 */
function generateSummary(): object {
  const errors = state.logs.filter(l => l.level === 'error');
  const warnings = state.logs.filter(l => l.level === 'warn');
  const wsEvents = state.logs.filter(l => l.source === 'websocket');
  const metrics = state.logs.filter(l => l.event.startsWith('metric:'));
  
  // Event frekansları
  const eventCounts: Record<string, number> = {};
  state.logs.forEach(l => {
    eventCounts[l.event] = (eventCounts[l.event] || 0) + 1;
  });
  
  return {
    counts: {
      total: state.logs.length,
      errors: errors.length,
      warnings: warnings.length,
      wsEvents: wsEvents.length,
      metrics: metrics.length,
    },
    errors: errors.map(e => ({ time: e.timestamp, event: e.event, data: e.data })),
    warnings: warnings.map(w => ({ time: w.timestamp, event: w.event, data: w.data })),
    eventFrequency: eventCounts,
  };
}

/**
 * Hassas verileri temizle
 */
function sanitizeData(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  
  if (typeof data === 'string') {
    // Çok uzun stringleri kırp
    if (data.length > 500) {
      return data.substring(0, 500) + '... [truncated]';
    }
    return data;
  }
  
  if (typeof data === 'object') {
    if (Array.isArray(data)) {
      // Büyük array'leri özetle
      if (data.length > 20) {
        return {
          _type: 'array',
          length: data.length,
          sample: data.slice(0, 5),
        };
      }
      return data.map(sanitizeData);
    }
    
    // Object'i temizle
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      // Hassas alanları gizle
      if (['apiKey', 'token', 'password', 'secret'].some(s => key.toLowerCase().includes(s))) {
        cleaned[key] = '[REDACTED]';
      } else if (value instanceof ArrayBuffer || value instanceof Uint8Array) {
        cleaned[key] = `[Binary: ${(value as ArrayBuffer).byteLength || (value as Uint8Array).length} bytes]`;
      } else {
        cleaned[key] = sanitizeData(value);
      }
    }
    return cleaned;
  }
  
  return data;
}

// Singleton export
export const sessionLogger = {
  init: initLogger,
  log,
  logWS,
  logState,
  logError,
  logMetric,
  getLogs,
  clearLogs,
  export: exportLogs,
};

export default sessionLogger;
