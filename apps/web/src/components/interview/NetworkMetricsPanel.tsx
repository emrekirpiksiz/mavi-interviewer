'use client';

import { useState } from 'react';
import { useInterviewStore } from '@/stores/interviewStore';
import type { NetworkMetric, NetworkMetricService } from '@ai-interview/shared';
import { ChevronDown, ChevronUp, Activity, Maximize2, Minimize2, X, Copy, Check } from 'lucide-react';

// ============================================
// NETWORK METRICS PANEL
// ============================================
// Displays API call metrics for OpenAI, ElevenLabs, Whisper, Simli
// Including cost analysis for each service

// ============================================
// PRICING CONSTANTS (per unit)
// ============================================
const PRICING = {
  // GPT-4o-mini: $0.15/1M input tokens, $0.60/1M output tokens
  openai: {
    inputPerToken: 0.15 / 1_000_000,    // $0.00000015
    outputPerToken: 0.60 / 1_000_000,   // $0.0000006
  },
  // ElevenLabs Turbo/Flash: $0.15/1000 characters
  elevenlabs: {
    perCharacter: 0.15 / 1000,          // $0.00015
  },
  // Whisper: $0.006/minute
  whisper: {
    perMinute: 0.006,                    // $0.006
  },
  // Simli: $10/1000 minutes = $0.01/minute
  simli: {
    perMinute: 0.01,                     // $0.01
  },
} as const;

interface ServiceSummary {
  service: NetworkMetricService;
  label: string;
  model: string;
  totalCalls: number;
  totalDurationMs: number;
  avgDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  // Service-specific metrics
  totalInputTokens: number;   // OpenAI
  totalOutputTokens: number;  // OpenAI
  totalCharacters: number;    // ElevenLabs
  totalAudioMinutes: number;  // Whisper (input audio)
  totalVideoMinutes: number;  // Simli (output video)
  // Cost
  totalCost: number;
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatSize(bytes: number | undefined): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

function formatTokens(tokens: number | undefined): string {
  if (!tokens) return '-';
  if (tokens < 1000) return `${tokens}`;
  return `${(tokens / 1000).toFixed(1)}K`;
}

function formatCost(cost: number): string {
  if (cost < 0.0001) return '-';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(3)}`;
}

function formatMinutes(ms: number | undefined): string {
  if (!ms) return '-';
  const minutes = ms / 60000;
  if (minutes < 1) return `${(ms / 1000).toFixed(1)}s`;
  return `${minutes.toFixed(2)}dk`;
}

function formatCharacters(chars: number | undefined): string {
  if (!chars) return '-';
  if (chars < 1000) return `${chars}`;
  return `${(chars / 1000).toFixed(1)}K`;
}

// Calculate cost for a single metric
function calculateMetricCost(metric: NetworkMetric): number {
  switch (metric.service) {
    case 'openai': {
      const inputTokens = Number(metric.metadata?.inputTokens) || 0;
      const outputTokens = Number(metric.metadata?.outputTokens) || 0;
      return (inputTokens * PRICING.openai.inputPerToken) + 
             (outputTokens * PRICING.openai.outputPerToken);
    }
    case 'elevenlabs': {
      const chars = Number(metric.metadata?.textLength) || 0;
      return chars * PRICING.elevenlabs.perCharacter;
    }
    case 'whisper': {
      const audioMs = Number(metric.metadata?.audioLengthMs) || 0;
      const minutes = audioMs / 60000;
      return minutes * PRICING.whisper.perMinute;
    }
    case 'simli': {
      const audioMs = Number(metric.metadata?.audioDurationMs) || 0;
      const minutes = audioMs / 60000;
      return minutes * PRICING.simli.perMinute;
    }
    default:
      return 0;
  }
}

function getServiceLabel(service: NetworkMetricService): string {
  switch (service) {
    case 'openai':
      return 'OpenAI GPT';
    case 'elevenlabs':
      return 'ElevenLabs TTS';
    case 'whisper':
      return 'Whisper STT';
    case 'simli':
      return 'Simli Avatar';
    default:
      return service;
  }
}

function getServiceDescription(service: NetworkMetricService): string {
  switch (service) {
    case 'openai':
      return 'Soru üretimi ve yanıt analizi';
    case 'elevenlabs':
      return 'Metin → Ses dönüşümü';
    case 'whisper':
      return 'Ses → Metin dönüşümü';
    case 'simli':
      return 'Avatar lip-sync renderı';
    default:
      return '';
  }
}

function getServiceColor(service: NetworkMetricService): string {
  switch (service) {
    case 'openai':
      return 'text-emerald-400';
    case 'elevenlabs':
      return 'text-blue-400';
    case 'whisper':
      return 'text-green-400';
    case 'simli':
      return 'text-orange-400';
    default:
      return 'text-gray-400';
  }
}

function getServiceBgColor(service: NetworkMetricService): string {
  switch (service) {
    case 'openai':
      return 'bg-emerald-500/10 border-emerald-500/30';
    case 'elevenlabs':
      return 'bg-blue-500/10 border-blue-500/30';
    case 'whisper':
      return 'bg-green-500/10 border-green-500/30';
    case 'simli':
      return 'bg-orange-500/10 border-orange-500/30';
    default:
      return 'bg-gray-500/10 border-gray-500/30';
  }
}

// Metric Detail Modal Component
function MetricDetailModal({ 
  metric, 
  onClose 
}: { 
  metric: NetworkMetric; 
  onClose: () => void;
}) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = async (text: string, fieldName: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const renderCopyButton = (text: string, fieldName: string) => (
    <button
      onClick={() => copyToClipboard(text, fieldName)}
      className="ml-2 p-1 hover:bg-[var(--bg-tertiary)] rounded transition-colors"
      title="Kopyala"
    >
      {copiedField === fieldName ? (
        <Check className="w-3.5 h-3.5 text-green-400" />
      ) : (
        <Copy className="w-3.5 h-3.5 text-[var(--text-muted)]" />
      )}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div 
        className="bg-[var(--bg-secondary)] rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-[var(--border-default)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-default)]">
          <div className="flex items-center gap-3">
            <span className={`text-lg font-semibold ${getServiceColor(metric.service)}`}>
              {getServiceLabel(metric.service)}
            </span>
            <span className="text-[var(--text-muted)]">•</span>
            <span className="text-[var(--text-primary)]">{metric.operation}</span>
            <span className="text-xs text-[var(--text-muted)] ml-4 font-mono">
              {formatDuration(metric.durationMs)}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
            title="Kapat"
          >
            <X className="w-5 h-5 text-[var(--text-muted)]" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Request Details */}
          {metric.requestDetails && (
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                Request
              </h3>
              <div className="space-y-3">
                {/* URL */}
                <div className="bg-[var(--bg-tertiary)] rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-[var(--text-muted)]">URL</span>
                    {renderCopyButton(metric.requestDetails.url, 'url')}
                  </div>
                  <code className="text-sm text-[var(--text-primary)] break-all">
                    {metric.requestDetails.method} {metric.requestDetails.url}
                  </code>
                </div>

                {/* System Prompt */}
                {!!metric.requestDetails.body?.systemPrompt && (
                  <div className="bg-[var(--bg-tertiary)] rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-[var(--text-muted)]">System Prompt</span>
                      {renderCopyButton(String(metric.requestDetails.body.systemPrompt), 'systemPrompt')}
                    </div>
                    <pre className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap max-h-48 overflow-y-auto font-mono">
                      {String(metric.requestDetails.body.systemPrompt)}
                    </pre>
                  </div>
                )}

                {/* User Message */}
                {!!metric.requestDetails.body?.userMessage && (
                  <div className="bg-[var(--bg-tertiary)] rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-[var(--text-muted)]">User Message</span>
                      {renderCopyButton(String(metric.requestDetails.body.userMessage), 'userMessage')}
                    </div>
                    <pre className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap max-h-32 overflow-y-auto font-mono">
                      {String(metric.requestDetails.body.userMessage)}
                    </pre>
                  </div>
                )}

                {/* Messages (conversation history) */}
                {!!metric.requestDetails.body?.messages && Array.isArray(metric.requestDetails.body.messages) && (
                  <div className="bg-[var(--bg-tertiary)] rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-[var(--text-muted)]">
                        Conversation History ({(metric.requestDetails.body.messages as Array<{ role: string; content: string }>).length} messages)
                      </span>
                    </div>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {(metric.requestDetails.body.messages as Array<{ role: string; content: string }>).map((msg, i) => (
                        <div key={i} className={`text-xs p-2 rounded ${
                          msg.role === 'assistant' ? 'bg-blue-500/10' : 'bg-green-500/10'
                        }`}>
                          <span className={`font-semibold ${
                            msg.role === 'assistant' ? 'text-blue-400' : 'text-green-400'
                          }`}>
                            {msg.role}:
                          </span>
                          <span className="text-[var(--text-secondary)] ml-2">
                            {String(msg.content).substring(0, 200)}{String(msg.content).length > 200 ? '...' : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* TTS Text */}
                {!!metric.requestDetails.body?.text && (
                  <div className="bg-[var(--bg-tertiary)] rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-[var(--text-muted)]">Text (TTS Input)</span>
                      {renderCopyButton(String(metric.requestDetails.body.text), 'ttsText')}
                    </div>
                    <pre className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap max-h-32 overflow-y-auto font-mono">
                      {String(metric.requestDetails.body.text)}
                    </pre>
                  </div>
                )}

                {/* Model */}
                {!!metric.requestDetails.body?.model && (
                  <div className="bg-[var(--bg-tertiary)] rounded-lg p-3">
                    <span className="text-xs text-[var(--text-muted)]">Model: </span>
                    <code className="text-sm text-[var(--text-primary)]">
                      {String(metric.requestDetails.body.model)}
                    </code>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Response Details */}
          {metric.responseDetails && (
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                Response
              </h3>
              <div className="space-y-3">
                {/* Status */}
                {metric.responseDetails.status && (
                  <div className="bg-[var(--bg-tertiary)] rounded-lg p-3">
                    <span className="text-xs text-[var(--text-muted)]">Status: </span>
                    <code className={`text-sm ${
                      metric.responseDetails.status >= 200 && metric.responseDetails.status < 300 
                        ? 'text-green-400' 
                        : 'text-red-400'
                    }`}>
                      {metric.responseDetails.status}
                    </code>
                  </div>
                )}

                {/* Content */}
                {!!metric.responseDetails.content && (
                  <div className="bg-[var(--bg-tertiary)] rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-[var(--text-muted)]">Response Content</span>
                      {renderCopyButton(String(metric.responseDetails.content), 'responseContent')}
                    </div>
                    <pre className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap max-h-48 overflow-y-auto font-mono">
                      {String(metric.responseDetails.content)}
                    </pre>
                  </div>
                )}

                {/* Parsed Response */}
                {!!metric.responseDetails.parsed && (
                  <div className="bg-[var(--bg-tertiary)] rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-[var(--text-muted)]">Parsed Response (JSON)</span>
                      {renderCopyButton(JSON.stringify(metric.responseDetails.parsed, null, 2), 'parsedResponse')}
                    </div>
                    <pre className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap max-h-48 overflow-y-auto font-mono">
                      {JSON.stringify(metric.responseDetails.parsed, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Token Usage */}
                {metric.responseDetails.usage && (
                  <div className="bg-[var(--bg-tertiary)] rounded-lg p-3">
                    <span className="text-xs text-[var(--text-muted)] block mb-2">Token Usage</span>
                    <div className="flex gap-4 text-sm">
                      <div>
                        <span className="text-[var(--text-muted)]">Prompt: </span>
                        <span className="text-[var(--text-primary)] font-mono">
                          {metric.responseDetails.usage.promptTokens?.toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-[var(--text-muted)]">Completion: </span>
                        <span className="text-[var(--text-primary)] font-mono">
                          {metric.responseDetails.usage.completionTokens?.toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-[var(--text-muted)]">Total: </span>
                        <span className="text-[var(--text-primary)] font-mono font-semibold">
                          {metric.responseDetails.usage.totalTokens?.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Metadata */}
          {metric.metadata && Object.keys(metric.metadata).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                Metadata
              </h3>
              <div className="bg-[var(--bg-tertiary)] rounded-lg p-3">
                <pre className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap font-mono">
                  {JSON.stringify(metric.metadata, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Basic Info (if no request/response details) */}
          {!metric.requestDetails && !metric.responseDetails && (
            <div className="text-center text-[var(--text-muted)] py-8">
              <p>Bu çağrı için detaylı bilgi mevcut değil.</p>
              <p className="text-xs mt-2">
                Yalnızca temel metrikler kaydedilmiş: {formatDuration(metric.durationMs)}, 
                Input: {formatSize(metric.inputSize)}, Output: {formatSize(metric.outputSize)}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[var(--border-default)] bg-[var(--bg-tertiary)]">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>
              {new Date(metric.timestamp).toLocaleString('tr-TR')}
            </span>
            <span>
              ID: {metric.id}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function NetworkMetricsPanel() {
  const networkMetrics = useInterviewStore((state) => state.networkMetrics);
  const [isExpanded, setIsExpanded] = useState(false); // Default collapsed
  const [showDetails, setShowDetails] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<NetworkMetric | null>(null);

  // Calculate summaries per service
  const summaries: ServiceSummary[] = (['openai', 'elevenlabs', 'whisper', 'simli'] as NetworkMetricService[])
    .map((service) => {
      const serviceMetrics = networkMetrics.filter((m) => m.service === service);
      const durations = serviceMetrics.map((m) => m.durationMs);
      const totalDurationMs = durations.reduce((acc, d) => acc + d, 0);

      // Service-specific aggregations
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalCharacters = 0;
      let totalAudioMinutes = 0;
      let totalVideoMinutes = 0;
      let totalCost = 0;
      let model = '';

      serviceMetrics.forEach((m) => {
        // Get model from first metric that has it
        if (!model && m.metadata?.model) {
          model = String(m.metadata.model);
        }

        // Calculate cost and aggregate service-specific metrics
        totalCost += calculateMetricCost(m);

        switch (service) {
          case 'openai':
            totalInputTokens += Number(m.metadata?.inputTokens) || 0;
            totalOutputTokens += Number(m.metadata?.outputTokens) || 0;
            break;
          case 'elevenlabs':
            totalCharacters += Number(m.metadata?.textLength) || 0;
            break;
          case 'whisper':
            totalAudioMinutes += (Number(m.metadata?.audioLengthMs) || 0) / 60000;
            break;
          case 'simli':
            totalVideoMinutes += (Number(m.metadata?.audioDurationMs) || 0) / 60000;
            break;
        }
      });

      return {
        service,
        label: getServiceLabel(service),
        model,
        totalCalls: serviceMetrics.length,
        totalDurationMs,
        avgDurationMs: serviceMetrics.length > 0 ? totalDurationMs / serviceMetrics.length : 0,
        minDurationMs: durations.length > 0 ? Math.min(...durations) : 0,
        maxDurationMs: durations.length > 0 ? Math.max(...durations) : 0,
        totalInputTokens,
        totalOutputTokens,
        totalCharacters,
        totalAudioMinutes,
        totalVideoMinutes,
        totalCost,
      };
    });

  // Total stats
  const activeSummaries = summaries.filter((s) => s.totalCalls > 0);
  const totalDuration = activeSummaries.reduce((acc, s) => acc + s.totalDurationMs, 0);
  const totalCalls = activeSummaries.reduce((acc, s) => acc + s.totalCalls, 0);
  const totalCost = activeSummaries.reduce((acc, s) => acc + s.totalCost, 0);

  if (networkMetrics.length === 0) {
    return null;
  }

  // Fullscreen modal
  if (isFullscreen) {
    return (
      <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
        <div className="bg-[var(--bg-secondary)] rounded-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col border border-[var(--border-default)]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-default)]">
            <div className="flex items-center gap-3">
              <Activity className="w-5 h-5 text-[var(--accent-primary)]" />
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Network Metrikleri - Detaylı Görünüm
              </h2>
              <span className="text-sm text-[var(--text-muted)] ml-4">
                {totalCalls} çağrı • {formatDuration(totalDuration)} toplam
              </span>
            </div>
            <button
              onClick={() => setIsFullscreen(false)}
              className="p-2 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
              title="Küçült"
            >
              <Minimize2 className="w-5 h-5 text-[var(--text-muted)]" />
            </button>
          </div>

          {/* Service Cards */}
          <div className="p-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
            {summaries.map((summary) => (
              <div
                key={summary.service}
                className={`rounded-lg p-4 border ${getServiceBgColor(summary.service)}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`font-semibold ${getServiceColor(summary.service)}`}>
                    {summary.label}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {summary.totalCalls} çağrı
                  </span>
                </div>
                {summary.model && (
                  <p className="text-xs text-[var(--text-muted)] font-mono mb-2">
                    {summary.model}
                  </p>
                )}
                <p className="text-xs text-[var(--text-muted)] mb-3">
                  {getServiceDescription(summary.service)}
                </p>
                {summary.totalCalls > 0 ? (
                  <div className="space-y-1 text-sm">
                    {/* Service-specific usage metrics */}
                    {summary.service === 'openai' && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-[var(--text-muted)]">Input Token:</span>
                          <span className="text-[var(--text-primary)] font-mono">
                            {formatTokens(summary.totalInputTokens)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[var(--text-muted)]">Output Token:</span>
                          <span className="text-[var(--text-primary)] font-mono">
                            {formatTokens(summary.totalOutputTokens)}
                          </span>
                        </div>
                      </>
                    )}
                    {summary.service === 'elevenlabs' && (
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">Karakter:</span>
                        <span className="text-[var(--text-primary)] font-mono">
                          {formatCharacters(summary.totalCharacters)}
                        </span>
                      </div>
                    )}
                    {summary.service === 'whisper' && (
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">Ses Süresi:</span>
                        <span className="text-[var(--text-primary)] font-mono">
                          {summary.totalAudioMinutes.toFixed(2)} dk
                        </span>
                      </div>
                    )}
                    {summary.service === 'simli' && (
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">Video Süresi:</span>
                        <span className="text-[var(--text-primary)] font-mono">
                          {summary.totalVideoMinutes.toFixed(2)} dk
                        </span>
                      </div>
                    )}

                    {/* Duration stats */}
                    <div className="flex justify-between pt-1 border-t border-[var(--border-subtle)]">
                      <span className="text-[var(--text-muted)]">Ort. Süre:</span>
                      <span className="text-[var(--text-secondary)] font-mono text-xs">
                        {formatDuration(summary.avgDurationMs)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Toplam:</span>
                      <span className="text-[var(--text-secondary)] font-mono text-xs">
                        {formatDuration(summary.totalDurationMs)}
                      </span>
                    </div>

                  </div>
                ) : (
                  <p className="text-xs text-[var(--text-muted)] italic">Henüz veri yok</p>
                )}
              </div>
            ))}
          </div>

          {/* Detailed Log */}
          <div className="flex-1 overflow-hidden border-t border-[var(--border-default)]">
            <div className="px-6 py-3 bg-[var(--bg-tertiary)]">
              <h3 className="text-sm font-medium text-[var(--text-primary)]">
                Çağrı Geçmişi (Kronolojik)
              </h3>
            </div>
            <div className="overflow-auto max-h-[40vh]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[var(--bg-secondary)]">
                  <tr>
                    <th className="text-left px-6 py-2 text-[var(--text-muted)] font-medium">Sıra</th>
                    <th className="text-left px-4 py-2 text-[var(--text-muted)] font-medium">Zaman</th>
                    <th className="text-left px-4 py-2 text-[var(--text-muted)] font-medium">Servis</th>
                    <th className="text-left px-4 py-2 text-[var(--text-muted)] font-medium">İşlem</th>
                    <th className="text-right px-4 py-2 text-[var(--text-muted)] font-medium">Süre</th>
                    <th className="text-right px-4 py-2 text-[var(--text-muted)] font-medium">Kullanım</th>
                    <th className="text-left px-4 py-2 text-[var(--text-muted)] font-medium">Detay</th>
                  </tr>
                </thead>
                <tbody>
                  {networkMetrics.map((metric, index) => {
                    // Format usage based on service
                    let usageText = '-';
                    switch (metric.service) {
                      case 'openai':
                        usageText = `${formatTokens(Number(metric.metadata?.inputTokens) || undefined)} / ${formatTokens(Number(metric.metadata?.outputTokens) || undefined)} tok`;
                        break;
                      case 'elevenlabs':
                        usageText = `${formatCharacters(Number(metric.metadata?.textLength) || undefined)} kar`;
                        break;
                      case 'whisper':
                        usageText = `${(Number(metric.metadata?.audioLengthMs || 0) / 1000).toFixed(1)}s ses`;
                        break;
                      case 'simli':
                        usageText = `${(Number(metric.metadata?.audioDurationMs || 0) / 1000).toFixed(1)}s video`;
                        break;
                    }
                    
                    return (
                      <tr 
                        key={metric.id} 
                        className="border-t border-[var(--border-subtle)] hover:bg-[var(--bg-tertiary)] cursor-pointer"
                        onClick={() => setSelectedMetric(metric)}
                      >
                        <td className="px-6 py-2 text-[var(--text-muted)] font-mono">
                          #{index + 1}
                        </td>
                        <td className="px-4 py-2 text-[var(--text-secondary)]">
                          {new Date(metric.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 1 })}
                        </td>
                        <td className={`px-4 py-2 font-medium ${getServiceColor(metric.service)}`}>
                          {getServiceLabel(metric.service)}
                        </td>
                        <td className="px-4 py-2 text-[var(--text-primary)]">
                          {metric.operation}
                        </td>
                        <td className="text-right px-4 py-2 text-[var(--text-primary)] font-mono font-semibold">
                          {formatDuration(metric.durationMs)}
                        </td>
                        <td className="text-right px-4 py-2 text-[var(--text-secondary)] font-mono text-xs">
                          {usageText}
                        </td>
                        <td className="px-4 py-2 text-[var(--accent-primary)] text-xs">
                          <span className="hover:underline">Detay →</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-default)] overflow-hidden">
      {/* Header - always visible */}
      <div className="flex items-center justify-between px-4 py-3 hover:bg-[var(--bg-secondary)] transition-colors">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex-1 flex items-center gap-2"
        >
          <Activity className="w-4 h-4 text-[var(--accent-primary)]" />
          <span className="text-sm font-medium text-[var(--text-primary)]">
            Network Metrikleri
          </span>
          <span className="text-xs text-[var(--text-muted)] ml-2">
            {totalCalls} çağrı • {formatDuration(totalDuration)}
          </span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-[var(--text-muted)] ml-auto" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[var(--text-muted)] ml-auto" />
          )}
        </button>
        <button
          onClick={() => setIsFullscreen(true)}
          className="ml-2 p-1.5 hover:bg-[var(--bg-primary)] rounded transition-colors"
          title="Tam ekran görünüm"
        >
          <Maximize2 className="w-4 h-4 text-[var(--text-muted)]" />
        </button>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-[var(--border-default)]">
          {/* Service Summary Cards */}
          <div className="p-3 grid grid-cols-2 gap-2">
            {summaries.map((summary) => {
              // Get compact usage text
              let usageText = '';
              switch (summary.service) {
                case 'openai':
                  usageText = `${formatTokens(summary.totalInputTokens + summary.totalOutputTokens)} tok`;
                  break;
                case 'elevenlabs':
                  usageText = `${formatCharacters(summary.totalCharacters)} kar`;
                  break;
                case 'whisper':
                  usageText = `${summary.totalAudioMinutes.toFixed(1)} dk`;
                  break;
                case 'simli':
                  usageText = `${summary.totalVideoMinutes.toFixed(1)} dk`;
                  break;
              }
              
              return (
                <div
                  key={summary.service}
                  className={`rounded-md p-2 border ${getServiceBgColor(summary.service)} ${summary.totalCalls === 0 ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-medium ${getServiceColor(summary.service)}`}>
                      {summary.label}
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">
                      {summary.totalCalls}x
                    </span>
                  </div>
                  {summary.totalCalls > 0 && (
                    <div className="mt-1 text-xs">
                      <span className="text-[var(--text-muted)]">{usageText}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Toggle Details Button */}
          <div className="px-4 py-2 border-t border-[var(--border-subtle)] flex items-center justify-between">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-xs text-[var(--accent-primary)] hover:text-[var(--accent-hover)] transition-colors"
            >
              {showDetails ? 'Detayları Gizle' : 'Tüm Çağrıları Göster'}
            </button>
            <button
              onClick={() => setIsFullscreen(true)}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              Tam Ekran
            </button>
          </div>

          {/* Detailed Metrics */}
          {showDetails && (
            <div className="border-t border-[var(--border-subtle)] max-h-48 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[var(--bg-secondary)]">
                  <tr>
                    <th className="text-left px-3 py-1.5 text-[var(--text-muted)] font-medium">#</th>
                    <th className="text-left px-2 py-1.5 text-[var(--text-muted)] font-medium">Servis</th>
                    <th className="text-left px-2 py-1.5 text-[var(--text-muted)] font-medium">İşlem</th>
                    <th className="text-right px-2 py-1.5 text-[var(--text-muted)] font-medium">Süre</th>
                  </tr>
                </thead>
                <tbody>
                  {networkMetrics.map((metric, index) => (
                    <tr 
                      key={metric.id} 
                      className="border-t border-[var(--border-subtle)] hover:bg-[var(--bg-secondary)] cursor-pointer"
                      onClick={() => setSelectedMetric(metric)}
                    >
                      <td className="px-3 py-1 text-[var(--text-muted)] font-mono">
                        {index + 1}
                      </td>
                      <td className={`px-2 py-1 ${getServiceColor(metric.service)}`}>
                        {metric.service}
                      </td>
                      <td className="px-2 py-1 text-[var(--text-secondary)]">
                        {metric.operation}
                      </td>
                      <td className="text-right px-2 py-1 text-[var(--text-primary)] font-mono">
                        {formatDuration(metric.durationMs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      {selectedMetric && (
        <MetricDetailModal 
          metric={selectedMetric} 
          onClose={() => setSelectedMetric(null)} 
        />
      )}
    </div>
  );
}
