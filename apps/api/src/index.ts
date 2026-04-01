import { createServer } from 'http';
import { createApp } from './app.js';
import { config } from './config/index.js';
import { setupWebSocket } from './websocket/index.js';

// ============================================
// SERVER ENTRY POINT
// ============================================

const app = createApp();

// Create HTTP server from Express app
const server = createServer(app);

// Setup WebSocket server
const wss = setupWebSocket(server);

// Start server
server.listen(config.port, () => {
  console.log(`
╔════════════════════════════════════════════╗
║         AI Interview API Server            ║
╠════════════════════════════════════════════╣
║  Status:  Running                          ║
║  Port:    ${config.port.toString().padEnd(33)}║
║  Env:     ${config.nodeEnv.padEnd(33)}║
║  WS:      ws://localhost:${config.port}/ws${' '.repeat(33 - `ws://localhost:${config.port}/ws`.length)}║
╚════════════════════════════════════════════╝
  `);

  console.log(`Health check: http://localhost:${config.port}/health`);
  console.log(`WebSocket:    ws://localhost:${config.port}/ws?sessionId={sessionId}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, shutting down...');
  wss.close(() => {
    server.close(() => {
      console.log('[Server] Shutdown complete');
      process.exit(0);
    });
  });
});
