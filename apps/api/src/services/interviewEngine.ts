import OpenAI from 'openai';
import { config } from '../config/index.js';
import { connectionManager } from '../websocket/connectionManager.js';
import type {
  InterviewConfig,
  Session,
  InterviewPhase,
} from '@ai-interview/shared';

// ============================================
// INTERVIEW ENGINE - OPENAI GPT-4o MINI
// ============================================

// ---------- Types ----------

export type InterviewActionType = 'ask_question' | 'change_phase' | 'end_interview';
export type InterviewTurn = 'ai' | 'candidate';

export interface InterviewAction {
  action: InterviewActionType;
  question: string;
  nextPhase?: InterviewPhase;
  topic?: string | null;
  isFollowUp: boolean;
  note?: string | null;
  reasoning?: string | null; // AI'ın neden bu soruyu sorduğunun kısa açıklaması
  turn: InterviewTurn; // Sıra kimde? AI devam edecekse 'ai', aday cevap verecekse 'candidate'
}

interface ConversationContext {
  session: Session;
  config: InterviewConfig;
  lastAIMessage: string | null;
  lastCandidateMessage: string | null;
  elapsedMinutes: number;
  phaseQuestionCount: number;
}

// ---------- OpenAI Client ----------

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!config.openaiApiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    openaiClient = new OpenAI({
      apiKey: config.openaiApiKey,
    });
  }
  return openaiClient;
}

// ---------- Constants ----------

// Using GPT-4o mini for fast, cost-effective responses
const OPENAI_MODEL = 'gpt-4o-mini';
const MAX_TOKENS = 1024;
const TIMEOUT_MS = 15000;
const MAX_DURATION_MINUTES = 30;

// ---------- Response Parser ----------

/**
 * Parse OpenAI's JSON response into InterviewAction
 */
export function parseOpenAIResponse(content: string): InterviewAction {
  // Extract JSON from potential markdown code blocks
  let jsonStr = content.trim();
  
  // Handle markdown code blocks
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch && jsonMatch[1]) {
    jsonStr = jsonMatch[1].trim();
  }
  
  try {
    const parsed = JSON.parse(jsonStr);
    
    // Infer action if missing but text content exists
    if (!parsed.action || !['ask_question', 'change_phase', 'end_interview'].includes(parsed.action)) {
      const text = parsed.question || parsed.message || parsed.text;
      if (text) {
        console.warn(`[InterviewEngine] Missing/invalid action, inferring ask_question from text content`);
        parsed.action = 'ask_question';
        if (!parsed.question) parsed.question = text;
      } else {
        throw new Error('Invalid or missing action field and no text content to recover');
      }
    }
    
    // Ensure question is present for ask_question and change_phase
    if ((parsed.action === 'ask_question' || parsed.action === 'change_phase') && !parsed.question) {
      if (parsed.message) {
        parsed.question = parsed.message;
      } else {
        throw new Error('Question is required for ask_question and change_phase actions');
      }
    }
    
    // Validate nextPhase for change_phase action
    const validPhases: InterviewPhase[] = ['introduction', 'experience', 'technical', 'behavioral', 'motivation', 'closing'];
    
    // If change_phase but nextPhase is missing, try to infer it
    let nextPhase = parsed.nextPhase;
    let action = parsed.action;
    
    if (action === 'change_phase') {
      // Step 1: Try to use topic as nextPhase (AI sometimes confuses these)
      if (!nextPhase && parsed.topic && validPhases.includes(parsed.topic as InterviewPhase)) {
        console.log(`[InterviewEngine] nextPhase missing, using topic as nextPhase: ${parsed.topic}`);
        nextPhase = parsed.topic;
      }
      
      // Step 2: Try to infer from question text
      if (!validPhases.includes(nextPhase as InterviewPhase)) {
        const questionLower = (parsed.question || '').toLowerCase();
        
        // Check if question mentions a specific phase
        if (questionLower.includes('teknik') || questionLower.includes('technical')) {
          nextPhase = 'technical';
          console.log(`[InterviewEngine] Inferred nextPhase from question: technical`);
        } else if (questionLower.includes('deneyim') || questionLower.includes('experience')) {
          nextPhase = 'experience';
          console.log(`[InterviewEngine] Inferred nextPhase from question: experience`);
        } else if (questionLower.includes('davranış') || questionLower.includes('behavioral') || questionLower.includes('çalışma tarzı')) {
          nextPhase = 'behavioral';
          console.log(`[InterviewEngine] Inferred nextPhase from question: behavioral`);
        } else if (questionLower.includes('motivasyon') || questionLower.includes('kariyer')) {
          nextPhase = 'motivation';
          console.log(`[InterviewEngine] Inferred nextPhase from question: motivation`);
        } else if (questionLower.includes('kapanış') || questionLower.includes('soru')) {
          nextPhase = 'closing';
          console.log(`[InterviewEngine] Inferred nextPhase from question: closing`);
        }
      }
      
      // Step 3: If still invalid, convert to ask_question instead of failing
      if (!validPhases.includes(nextPhase as InterviewPhase)) {
        console.warn(`[InterviewEngine] Could not determine nextPhase, converting change_phase to ask_question`);
        action = 'ask_question';
        nextPhase = undefined;
      }
    }
    
    return {
      action: action, // May have been converted from change_phase to ask_question
      question: parsed.question || '',
      nextPhase: nextPhase,
      topic: parsed.topic ?? null,
      isFollowUp: parsed.isFollowUp ?? false,
      note: parsed.note ?? null,
      reasoning: parsed.reasoning ?? null,
      turn: parsed.turn === 'ai' ? 'ai' : 'candidate', // Default: candidate (aday cevap verecek)
    };
  } catch (error) {
    console.error('[InterviewEngine] Failed to parse OpenAI response:', error);
    console.error('[InterviewEngine] Raw content:', content);
    
    // Fallback: Try to create a sensible response
    throw new Error(`Failed to parse OpenAI response: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Backwards compatibility alias
export const parseClaudeResponse = parseOpenAIResponse;

// ---------- Message Builder ----------

/**
 * Build the user message for each conversation turn
 * If lastCandidateMessage is null, AI is continuing (turn was "ai")
 */
export function buildUserMessage(context: ConversationContext): string {
  const { session, config: interviewConfig, lastAIMessage, lastCandidateMessage, elapsedMinutes, phaseQuestionCount } = context;
  
  const maxDurationMinutes = MAX_DURATION_MINUTES;
  const timeWarning = elapsedMinutes > maxDurationMinutes * 0.8 
    ? '\n\n⚠️ UYARI: Süre azalıyor, görüşmeyi toparlayalım.'
    : '';
  
  const forceClosing = elapsedMinutes >= maxDurationMinutes
    ? '\n\n🚨 KRİTİK: Süre doldu! Hemen closing fazına geç ve görüşmeyi bitir.'
    : '';
  
  // Check if this is a continuation (AI's turn, no candidate response)
  const isContinuation = lastCandidateMessage === null && lastAIMessage !== null;
  
  let message = `## MEVCUT DURUM
- Faz: ${session.currentPhase}
- Geçen süre: ${elapsedMinutes} dk / ${maxDurationMinutes} dk
- Bu fazda soru sayısı: ${phaseQuestionCount}
${timeWarning}${forceClosing}

## SON KONUŞMA
AI: "${lastAIMessage || '(henüz konuşma yok)'}"
${isContinuation 
  ? `Aday: (beklemiyor - önceki mesajında turn: "ai" döndürdün, şimdi devam et)`
  : `Aday: "${lastCandidateMessage}"`
}

## GÖREV
${isContinuation 
  ? `Önceki mesajında turn: "ai" döndürdün, yani devam etmen gerekiyor.
Şimdi görüşme akışını anlat ve adaya ilk soruyu sor.
Bu sefer turn: "candidate" döndür ki aday cevap verebilsin.`
  : `Doğal bir recruiter olarak sonraki adımı belirle.
Cevabı değerlendirme, sadece sohbeti ilerlet.`
}`;

  return message;
}

/**
 * Build the first turn message (interview start)
 * First message is split into 2 parts for more natural flow
 */
export function buildFirstTurnMessage(session: Session, interviewConfig: InterviewConfig): string {
  return `## DURUM
Görüşme başlıyor. Bu ilk mesaj olacak.

## GÖREV
System prompt'taki "İLK MESAJ FORMATI - 2 PARÇALI" bölümünü takip et.

Bu PARÇA 1:
- Sadece kısa karşılama ve AI bildirimi yap (2-3 cümle)
- turn: "ai" döndür (mikrofon açılmasın, sistem seni tekrar çağıracak)

Örnek:
"Merhaba [aday adı], [şirket] adına hoş geldiniz! Bu görüşme yapay zeka destekli olarak gerçekleştiriliyor. Herhangi bir teknik sorun fark ederseniz bize bildirin."

ÖNEMLİ: Sadece karşılama yap, soru sorma! turn: "ai" döndür.`;
}

// ---------- Main Functions ----------

/**
 * Get the first question to start the interview
 */
export async function getFirstQuestion(
  session: Session,
  interviewConfig: InterviewConfig,
  systemPrompt: string,
  sessionId?: string
): Promise<InterviewAction> {
  const client = getOpenAIClient();
  
  const userMessage = buildFirstTurnMessage(session, interviewConfig);
  
  console.log('[InterviewEngine] Getting first question with GPT-4o mini...');
  
  const startTime = Date.now();
  
  try {
    const response = await Promise.race([
      client.chat.completions.create({
        model: OPENAI_MODEL,
        max_tokens: MAX_TOKENS,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        response_format: { type: 'json_object' },
      }),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('OpenAI API timeout')), TIMEOUT_MS)
      ),
    ]);
    
    const durationMs = Date.now() - startTime;
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No content in OpenAI response');
    }
    
    const action = parseOpenAIResponse(content);
    console.log('[InterviewEngine] First question action:', action.action, `(${durationMs}ms)`);
    
    // Send network metric with full request/response details
    if (sessionId) {
      connectionManager.sendNetworkMetric(sessionId, 'openai', 'first_question', durationMs, {
        inputSize: systemPrompt.length + userMessage.length,
        outputSize: content.length,
        metadata: {
          model: OPENAI_MODEL,
          inputTokens: response.usage?.prompt_tokens,
          outputTokens: response.usage?.completion_tokens,
        },
        requestDetails: {
          url: 'https://api.openai.com/v1/chat/completions',
          method: 'POST',
          body: {
            model: OPENAI_MODEL,
            systemPrompt: systemPrompt,
            userMessage: userMessage,
          },
        },
        responseDetails: {
          content: content,
          parsed: action,
          usage: {
            promptTokens: response.usage?.prompt_tokens,
            completionTokens: response.usage?.completion_tokens,
            totalTokens: response.usage?.total_tokens,
          },
        },
      });
    }
    
    return action;
  } catch (error) {
    console.error('[InterviewEngine] Error getting first question:', error);
    throw error;
  }
}

/**
 * Get the next action based on candidate's response
 */
export async function getNextAction(
  context: ConversationContext,
  systemPrompt: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  sessionId?: string
): Promise<InterviewAction> {
  const client = getOpenAIClient();
  
  const userMessage = buildUserMessage(context);
  
  // Build messages array with conversation history
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];
  
  console.log('[InterviewEngine] Getting next action for phase:', context.session.currentPhase);
  
  const startTime = Date.now();
  
  try {
    const response = await Promise.race([
      client.chat.completions.create({
        model: OPENAI_MODEL,
        max_tokens: MAX_TOKENS,
        messages,
        response_format: { type: 'json_object' },
      }),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('OpenAI API timeout')), TIMEOUT_MS)
      ),
    ]);
    
    const durationMs = Date.now() - startTime;
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No content in OpenAI response');
    }
    
    const action = parseOpenAIResponse(content);
    console.log('[InterviewEngine] Next action:', action.action, action.nextPhase ? `-> ${action.nextPhase}` : '', `(${durationMs}ms)`);
    
    // Send network metric with full request/response details
    if (sessionId) {
      const totalInputSize = systemPrompt.length + conversationHistory.reduce((acc, m) => acc + m.content.length, 0) + userMessage.length;
      connectionManager.sendNetworkMetric(sessionId, 'openai', 'next_action', durationMs, {
        inputSize: totalInputSize,
        outputSize: content.length,
        metadata: {
          model: OPENAI_MODEL,
          phase: context.session.currentPhase,
          inputTokens: response.usage?.prompt_tokens,
          outputTokens: response.usage?.completion_tokens,
        },
        requestDetails: {
          url: 'https://api.openai.com/v1/chat/completions',
          method: 'POST',
          body: {
            model: OPENAI_MODEL,
            systemPrompt: systemPrompt,
            userMessage: userMessage,
            messages: conversationHistory,
          },
        },
        responseDetails: {
          content: content,
          parsed: action,
          usage: {
            promptTokens: response.usage?.prompt_tokens,
            completionTokens: response.usage?.completion_tokens,
            totalTokens: response.usage?.total_tokens,
          },
        },
      });
    }
    
    return action;
  } catch (error) {
    console.error('[InterviewEngine] Error getting next action:', error);
    throw error;
  }
}

/**
 * Handle interview interrupt - generate a short acknowledgment
 */
export async function getInterruptResponse(systemPrompt: string): Promise<string> {
  const client = getOpenAIClient();
  
  const userMessage = `Aday beni kesti. Kısa bir "Buyurun, sizi dinliyorum" tarzı yanıt ver. Sadece tek cümle, JSON formatı kullanma.`;
  
  try {
    const response = await Promise.race([
      client.chat.completions.create({
        model: OPENAI_MODEL,
        max_tokens: 100,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
      }),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('OpenAI API timeout')), TIMEOUT_MS)
      ),
    ]);
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      return 'Buyurun, sizi dinliyorum.';
    }
    
    // Return raw text for interrupt (no JSON parsing)
    return content.trim();
  } catch (error) {
    console.error('[InterviewEngine] Error getting interrupt response:', error);
    return 'Buyurun, sizi dinliyorum.';
  }
}

// ---------- Exports ----------

// Export with backwards compatible naming
export const CLAUDE_MODEL = OPENAI_MODEL;
export { MAX_TOKENS, TIMEOUT_MS, MAX_DURATION_MINUTES };
