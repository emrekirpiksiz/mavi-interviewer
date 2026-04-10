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
  port: getEnvVarAsNumber('PORT', 2223),
  nodeEnv: getEnvVar('NODE_ENV', 'development'),
  isDevelopment: getEnvVar('NODE_ENV', 'development') === 'development',
  isProduction: getEnvVar('NODE_ENV', 'development') === 'production',

  // Frontend URL (for CORS)
  frontendUrl: getEnvVar('FRONTEND_URL', 'http://localhost:2222'),

  // Database
  databaseUrl: process.env['DATABASE_URL'] ?? '',

  // API Key for session creation
  atsApiKey: process.env['ATS_API_KEY'] ?? '',

  // AI Services
  openaiApiKey: process.env['OPENAI_API_KEY'] ?? '',
  openaiChatModel: process.env['OPENAI_CHAT_MODEL'] ?? 'gpt-5.4-mini',
  openaiValidatorModel: process.env['OPENAI_VALIDATOR_MODEL'] ?? 'gpt-5.4-nano',
  elevenLabsApiKey: process.env['ELEVENLABS_API_KEY'] ?? '',
  elevenLabsVoiceId: process.env['ELEVENLABS_VOICE_ID'] ?? 'pFZP5JQG7iQjIQuC4Bku',
  simliApiKey: process.env['SIMLI_API_KEY'] ?? '',

  // Demo access codes
  demoAccessCodes: (process.env['DEMO_ACCESS_CODES'] ?? 'DEMO2026').split(',').map(c => c.trim().toUpperCase()),

  // Audio Recording
  audioRecordingEnabled: process.env['AUDIO_RECORDING_ENABLED'] === 'true',
  audioRecordingTempDir: process.env['AUDIO_RECORDING_TEMP_DIR'] || path.join(os.tmpdir(), 'interview-recordings'),

  // Azure Blob Storage
  azureStorageConnectionString: process.env['AZURE_STORAGE_CONNECTION_STRING'] ?? '',
  azureStorageContainerName: process.env['AZURE_STORAGE_CONTAINER_NAME'] ?? 'interview-recordings',
} as const;

export type Config = typeof config;
