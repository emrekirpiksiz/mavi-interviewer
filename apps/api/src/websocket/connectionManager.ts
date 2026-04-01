import type { WebSocket } from 'ws';
import type { 
  NetworkMetric, 
  NetworkMetricService, 
  WSNetworkMetricEvent,
  NetworkMetricRequestDetails,
  NetworkMetricResponseDetails,
} from '@ai-interview/shared';

// ============================================
// CONNECTION MANAGER
// ============================================
// Tracks active WebSocket connections per session
// Enforces single connection policy

interface ConnectionInfo {
  ws: WebSocket;
  sessionId: string;
  connectedAt: Date;
  ip: string;
  userAgent: string;
  reconnectCount: number;
}

class ConnectionManager {
  private connections: Map<string, ConnectionInfo> = new Map();

  /**
   * Register a new connection for a session
   * If session already has a connection, closes the old one (single connection policy)
   * Returns takeover info if an existing connection was replaced
   */
  add(sessionId: string, ws: WebSocket, ip: string = 'unknown', userAgent: string = ''): { takeover: boolean; oldIp?: string; oldUserAgent?: string } {
    // Check for existing connection
    const existing = this.connections.get(sessionId);
    let takeoverInfo = { takeover: false as boolean, oldIp: undefined as string | undefined, oldUserAgent: undefined as string | undefined };
    
    if (existing) {
      console.log(`[ConnectionManager] Session ${sessionId} - Closing existing connection (session takeover)`);
      
      takeoverInfo = {
        takeover: true,
        oldIp: existing.ip,
        oldUserAgent: existing.userAgent,
      };
      
      // Close old connection with code 4010 (custom: session taken over by another client)
      existing.ws.close(4010, 'Session taken over by another client');
    }

    // Calculate reconnect count
    const reconnectCount = existing ? (existing.reconnectCount + 1) : 0;

    // Register new connection
    this.connections.set(sessionId, {
      ws,
      sessionId,
      connectedAt: new Date(),
      ip,
      userAgent,
      reconnectCount,
    });

    console.log(`[ConnectionManager] Session ${sessionId} - Connection registered (reconnect: ${reconnectCount}). Total connections: ${this.connections.size}`);
    return takeoverInfo;
  }

  /**
   * Remove a connection for a session
   */
  remove(sessionId: string): void {
    const removed = this.connections.delete(sessionId);
    
    if (removed) {
      console.log(`[ConnectionManager] Session ${sessionId} - Connection removed. Total connections: ${this.connections.size}`);
    }
  }

  /**
   * Get connection for a session
   */
  get(sessionId: string): ConnectionInfo | undefined {
    return this.connections.get(sessionId);
  }

  /**
   * Check if session has an active connection
   */
  has(sessionId: string): boolean {
    return this.connections.has(sessionId);
  }

  /**
   * Get total number of active connections
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Send JSON message to a specific session
   */
  send(sessionId: string, data: object): boolean {
    const connection = this.connections.get(sessionId);
    
    if (!connection || connection.ws.readyState !== 1) {
      console.log(`[ConnectionManager] Session ${sessionId} - Cannot send message, connection not ready`);
      return false;
    }

    try {
      connection.ws.send(JSON.stringify(data));
      return true;
    } catch (error) {
      console.error(`[ConnectionManager] Session ${sessionId} - Error sending message:`, error);
      return false;
    }
  }

  /**
   * Send binary data to a specific session (for audio chunks)
   */
  sendBinary(sessionId: string, data: Buffer | Uint8Array): boolean {
    const connection = this.connections.get(sessionId);
    
    if (!connection || connection.ws.readyState !== 1) {
      console.log(`[ConnectionManager] Session ${sessionId} - Cannot send binary, connection not ready`);
      return false;
    }

    try {
      connection.ws.send(data);
      return true;
    } catch (error) {
      console.error(`[ConnectionManager] Session ${sessionId} - Error sending binary:`, error);
      return false;
    }
  }

  /**
   * Close all connections (for graceful shutdown)
   */
  closeAll(): void {
    console.log(`[ConnectionManager] Closing all ${this.connections.size} connections`);
    
    for (const [sessionId, connection] of this.connections) {
      connection.ws.close(1001, 'Server shutting down');
      this.connections.delete(sessionId);
    }
  }

  /**
   * Send network metric to a specific session
   */
  sendNetworkMetric(
    sessionId: string,
    service: NetworkMetricService,
    operation: string,
    durationMs: number,
    options?: {
      inputSize?: number;
      outputSize?: number;
      metadata?: Record<string, unknown>;
      requestDetails?: NetworkMetricRequestDetails;
      responseDetails?: NetworkMetricResponseDetails;
    }
  ): boolean {
    const metric: NetworkMetric = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      service,
      operation,
      durationMs,
      inputSize: options?.inputSize,
      outputSize: options?.outputSize,
      timestamp: Date.now(),
      metadata: options?.metadata,
      requestDetails: options?.requestDetails,
      responseDetails: options?.responseDetails,
    };

    const event: WSNetworkMetricEvent = {
      event: 'network:metric',
      data: metric,
    };

    return this.send(sessionId, event);
  }
}

// Singleton instance
export const connectionManager = new ConnectionManager();
