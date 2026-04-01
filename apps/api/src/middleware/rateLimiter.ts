import rateLimit from 'express-rate-limit';

// ============================================
// RATE LIMITER MIDDLEWARE
// ============================================
// Katmanlı rate limiting: Global + endpoint-specific
// In-memory store (tek instance deployment, Redis gerekmez)

const baseConfig = {
  standardHeaders: true,   // RateLimit-* headers
  legacyHeaders: false,    // X-RateLimit-* headers kapalı
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests',
    },
  },
};

/**
 * Global rate limiter - Tüm REST endpoint'lere uygulanır
 * 100 request / 1 dakika / IP
 */
export const globalLimiter = rateLimit({
  ...baseConfig,
  windowMs: 60 * 1000,
  max: 100,
});

/**
 * POST /sessions rate limiter
 * ATS server-to-server, düşük hacim
 * 10 request / 1 dakika / IP
 */
export const createSessionLimiter = rateLimit({
  ...baseConfig,
  windowMs: 60 * 1000,
  max: 10,
});

/**
 * POST /demo-session rate limiter
 * Access code brute-force engeli
 * 5 request / 1 dakika / IP
 */
export const demoSessionLimiter = rateLimit({
  ...baseConfig,
  windowMs: 60 * 1000,
  max: 5,
});

/**
 * POST /transcribe rate limiter
 * Pahalı işlem (Whisper API maliyeti) ama realtime ihtiyaç
 * 30 request / 1 dakika / IP
 */
export const transcribeLimiter = rateLimit({
  ...baseConfig,
  windowMs: 60 * 1000,
  max: 30,
});
