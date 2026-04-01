import 'dotenv/config';
import path from 'path';
import os from 'os';

// ============================================
// ENVIRONMENT CONFIGURATION
// ============================================

function getEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name] ?? defaultValue;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getEnvVarAsNumber(name: string, defaultValue?: number): number {
  const value = process.env[name];
  if (value === undefined) {
    if (defaultValue === undefined) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid number for environment variable: ${name}`);
  }
  return parsed;
}

export const config = {
  // Server
  port: getEnvVarAsNumber('PORT', 3001),
  nodeEnv: getEnvVar('NODE_ENV', 'development'),
  isDevelopment: getEnvVar('NODE_ENV', 'development') === 'development',
  isProduction: getEnvVar('NODE_ENV', 'development') === 'production',

  // Frontend URL (for CORS)
  frontendUrl: getEnvVar('FRONTEND_URL', 'http://localhost:3000'),

  // Database (optional for now, required in Task 1.4)
  databaseUrl: process.env['DATABASE_URL'] ?? '',

  // ATS Integration (optional for now)
  atsCallbackUrl: process.env['ATS_CALLBACK_URL'] ?? '',
  atsApiKey: process.env['ATS_API_KEY'] ?? '',

  // AI Services (optional for now)
  anthropicApiKey: process.env['ANTHROPIC_API_KEY'] ?? '',
  openaiApiKey: process.env['OPENAI_API_KEY'] ?? '',
  elevenLabsApiKey: process.env['ELEVENLABS_API_KEY'] ?? '',
  elevenLabsVoiceId: process.env['ELEVENLABS_VOICE_ID'] ?? 'pFZP5JQG7iQjIQuC4Bku', // Default: Lily
  simliApiKey: process.env['SIMLI_API_KEY'] ?? '',

  // Demo access codes (comma-separated, e.g., "DEMO2026,TESTCODE")
  demoAccessCodes: (process.env['DEMO_ACCESS_CODES'] ?? 'DEMO2026').split(',').map(c => c.trim().toUpperCase()),

  // MatchMind (HR Portal) Integration
  // Support both MATCHMIND_* and INTERVIEW_WEBHOOK_* prefixes for compatibility
  matchmindApiUrl: process.env['MATCHMIND_API_URL'] ?? '',
  matchmindWebhookUsername: process.env['MATCHMIND_WEBHOOK_USERNAME'] ?? process.env['INTERVIEW_WEBHOOK_USERNAME'] ?? 'interview_app',
  matchmindWebhookPassword: process.env['MATCHMIND_WEBHOOK_PASSWORD'] ?? process.env['INTERVIEW_WEBHOOK_PASSWORD'] ?? '',

  // Audio Recording
  audioRecordingEnabled: process.env['AUDIO_RECORDING_ENABLED'] === 'true',
  audioRecordingTempDir: process.env['AUDIO_RECORDING_TEMP_DIR'] || path.join(os.tmpdir(), 'interview-recordings'),

  // Azure Blob Storage
  azureStorageConnectionString: process.env['AZURE_STORAGE_CONNECTION_STRING'] ?? '',
  azureStorageContainerName: process.env['AZURE_STORAGE_CONTAINER_NAME'] ?? 'interview-recordings',
} as const;

export type Config = typeof config;
