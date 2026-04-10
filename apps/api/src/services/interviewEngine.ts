import OpenAI from 'openai';
import { config } from '../config/index.js';
import { connectionManager } from '../websocket/connectionManager.js';
import type {
  AssessmentConfig,
  Session,
  AssessmentPhase,
} from '@ai-interview/shared';

// ============================================
// ASSESSMENT ENGINE - OPENAI (configurable model)
// ============================================

// ---------- Types ----------

export type AssessmentActionType = 'ask_question' | 'provide_correction' | 'end_assessment';
export type InterviewTurn = 'ai' | 'candidate';

export interface AssessmentAction {
  action: AssessmentActionType;
  text: string;
  questionId?: string | null;
  isCorrect?: boolean | null;
  turn: InterviewTurn;
  reasoning?: string | null;
}

interface ConversationContext {
  session: Session;
  config: AssessmentConfig;
  lastAIMessage: string | null;
  lastCandidateMessage: string | null;
  elapsedMinutes: number;
  currentQuestionIndex: number;
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

const OPENAI_MODEL = config.openaiChatModel;
const MAX_TOKENS = 1024;
const TIMEOUT_MS = 15000;

// ---------- Response Parser ----------

export function parseAssessmentResponse(content: string): AssessmentAction {
  let jsonStr = content.trim();
  
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch && jsonMatch[1]) {
    jsonStr = jsonMatch[1].trim();
  }
  
  try {
    const parsed = JSON.parse(jsonStr);
    
    if (!parsed.action || !['ask_question', 'provide_correction', 'end_assessment'].includes(parsed.action)) {
      const text = parsed.text || parsed.question || parsed.message;
      if (text) {
        console.warn(`[AssessmentEngine] Missing/invalid action, inferring ask_question`);
        parsed.action = 'ask_question';
        if (!parsed.text) parsed.text = text;
      } else {
        throw new Error('Invalid or missing action field and no text content');
      }
    }
    
    if (!parsed.text) {
      parsed.text = parsed.question || parsed.message || '';
    }
    
    if (parsed.reasoning) {
      console.log('[AssessmentEngine] Reasoning:', parsed.reasoning);
    }

    return {
      action: parsed.action,
      text: parsed.text || '',
      questionId: parsed.questionId ?? null,
      isCorrect: parsed.isCorrect ?? null,
      turn: parsed.turn === 'ai' ? 'ai' : 'candidate',
      reasoning: parsed.reasoning ?? null,
    };
  } catch (error) {
    console.error('[AssessmentEngine] Failed to parse response:', error);
    console.error('[AssessmentEngine] Raw content:', content);
    throw new Error(`Failed to parse response: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ---------- Message Builder ----------

export function buildUserMessage(context: ConversationContext): string {
  const { session, config: assessmentConfig, lastAIMessage, lastCandidateMessage, elapsedMinutes, currentQuestionIndex } = context;
  
  const totalQuestions = assessmentConfig.questionsData.length;
  const maxDuration = assessmentConfig.settings?.maxDurationMinutes ?? 45;
  
  const timeWarning = elapsedMinutes > maxDuration * 0.8
    ? '\n\n⚠️ UYARI: Süre azalıyor, hızlanmalıyız.'
    : '';
  
  const forceEnd = elapsedMinutes >= maxDuration
    ? '\n\n🚨 KRİTİK: Süre doldu! Hemen kapanış metnini söyle ve bitir.'
    : '';
  
  const isContinuation = lastCandidateMessage === null && lastAIMessage !== null;
  
  return `## MEVCUT DURUM
- Faz: ${session.currentPhase}
- Soru ilerlemesi: ${currentQuestionIndex}/${totalQuestions}
- Geçen süre: ${elapsedMinutes} dk / ${maxDuration} dk
${timeWarning}${forceEnd}

## SON KONUŞMA
AI: "${lastAIMessage || '(henüz konuşma yok)'}"
${isContinuation 
  ? `Aday: (beklemiyor - önceki mesajında turn: "ai" döndürdün, şimdi devam et)`
  : `Aday: "${lastCandidateMessage}"`
}

## GÖREV
${isContinuation 
  ? `Önceki mesajında turn: "ai" döndürdün. Şimdi devam et - sıradaki soruyu sor veya giriş metninin devamını söyle.
Bu sefer turn: "candidate" döndür.`
  : `Adayın cevabını değerlendir ve sıradaki adımı belirle.
Cevap doğruysa kısa olumlu geri bildirim ver ve sıradaki soruya geç.
Cevap yanlışsa ilgili sorunun "correctOnWrong" kuralına göre davran.
Tüm sorular bittiyse kapanış metnini söyle.`
}`;
}

export function buildFirstTurnMessage(): string {
  return `## DURUM
Değerlendirme başlıyor. Bu ilk mesaj olacak.

## GÖREV
System prompt'taki "İLK MESAJ FORMATI - 2 PARÇALI" bölümünü takip et.

Bu PARÇA 1:
- Giriş metninin ilk kısmını söyle (selamlama, hal hatır)
- turn: "ai" döndür (mikrofon açılmasın, sistem seni tekrar çağıracak)

ÖNEMLİ: Sadece karşılama yap, soru sorma! turn: "ai" döndür.`;
}

// ---------- Main Functions ----------

export async function getFirstQuestion(
  session: Session,
  assessmentConfig: AssessmentConfig,
  systemPrompt: string,
  sessionId?: string
): Promise<AssessmentAction> {
  const client = getOpenAIClient();
  
  const userMessage = buildFirstTurnMessage();
  
  console.log('[AssessmentEngine] Getting first message...');
  
  const startTime = Date.now();
  
  try {
    const response = await Promise.race([
      client.chat.completions.create({
        model: OPENAI_MODEL,
        max_completion_tokens: MAX_TOKENS,
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
    
    const action = parseAssessmentResponse(content);
    console.log('[AssessmentEngine] First message action:', action.action, `(${durationMs}ms)`);
    
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
          body: { model: OPENAI_MODEL, systemPrompt, userMessage },
        },
        responseDetails: {
          content,
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
    console.error('[AssessmentEngine] Error getting first message:', error);
    throw error;
  }
}

export async function getNextAction(
  context: ConversationContext,
  systemPrompt: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  sessionId?: string
): Promise<AssessmentAction> {
  const client = getOpenAIClient();
  
  const userMessage = buildUserMessage(context);
  
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];
  
  console.log('[AssessmentEngine] Getting next action, question index:', context.currentQuestionIndex);
  
  const startTime = Date.now();
  
  try {
    const response = await Promise.race([
      client.chat.completions.create({
        model: OPENAI_MODEL,
        max_completion_tokens: MAX_TOKENS,
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
    
    const action = parseAssessmentResponse(content);
    console.log('[AssessmentEngine] Next action:', action.action, `(${durationMs}ms)`);
    
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
          body: { model: OPENAI_MODEL, systemPrompt, userMessage, messages: conversationHistory },
        },
        responseDetails: {
          content,
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
    console.error('[AssessmentEngine] Error getting next action:', error);
    throw error;
  }
}

export async function getInterruptResponse(systemPrompt: string): Promise<string> {
  const client = getOpenAIClient();
  
  const userMessage = `Aday beni kesti. Kısa bir "Buyurun, sizi dinliyorum" tarzı yanıt ver. Sadece tek cümle, JSON formatı kullanma.`;
  
  try {
    const response = await Promise.race([
      client.chat.completions.create({
        model: OPENAI_MODEL,
        max_completion_tokens: 100,
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
    
    return content.trim();
  } catch (error) {
    console.error('[AssessmentEngine] Error getting interrupt response:', error);
    return 'Buyurun, sizi dinliyorum.';
  }
}
