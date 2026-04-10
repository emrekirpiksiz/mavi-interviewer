import OpenAI from 'openai';
import { config } from '../config/index.js';
import type { AssessmentPhase } from '@ai-interview/shared';

// ============================================
// STT VALIDATOR - GPT-5.4-NANO
// ============================================
// Validates STT output before sending to the interview engine.
// Catches hallucinations, gibberish, and echo artifacts.

const NANO_MODEL = config.openaiValidatorModel;
const TIMEOUT_MS = 5000;

let openaiClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: config.openaiApiKey });
  }
  return openaiClient;
}

export interface ValidationResult {
  valid: boolean;
  cleanedText?: string;
  retryMessage?: string;
  confidence: number;
}

interface ValidationContext {
  lastAIMessage: string | null;
  currentPhase: AssessmentPhase;
  assessmentTitle: string;
}

export async function validateTranscript(
  candidateText: string,
  context: ValidationContext
): Promise<ValidationResult> {
  // Fast-path: extremely short or empty text
  if (!candidateText || candidateText.trim().length < 2) {
    return {
      valid: false,
      retryMessage: 'Kusura bakmayın, sizi duyamadım. Tekrar söyler misiniz?',
      confidence: 1,
    };
  }

  const trimmed = candidateText.trim();

  // Fast-path: obvious gibberish patterns
  if (isObviousGibberish(trimmed)) {
    console.log(`[STTValidator] Obvious gibberish detected: "${trimmed.substring(0, 60)}"`);
    return {
      valid: false,
      retryMessage: 'Kusura bakmayın, sizi tam anlayamadım. Tekrar söyler misiniz?',
      confidence: 0.95,
    };
  }

  try {
    const client = getClient();

    const systemPrompt = `Sen bir STT (speech-to-text) kalite denetçisisin. Bir görüşmede adayın konuşması metne çevrildi. Senin görevin bu metnin gerçek, anlamlı bir insan konuşması mı yoksa STT hatası/gürültü/saçmalık mı olduğunu belirlemek.

SADECE şu JSON formatında yanıt ver:
{"valid": true/false, "confidence": 0.0-1.0}

valid=false olacak durumlar:
- Tekrar eden anlamsız kelimeler (örn: "vizyonu vizyonu vizyonu")
- Tamamen alakasız, rastgele kelime dizileri
- STT halüsinasyonları (örn: "altyazılar", "www.", tekrar eden heceler)
- Görüşme bağlamıyla hiç ilgisi olmayan ifadeler

valid=true olacak durumlar:
- Konuyla ilgili herhangi bir cevap (kısa veya uzun)
- STT yazım hataları olan ama anlamlı cevaplar (bunlar NORMAL)
- "bilmiyorum", "emin değilim", "hatırlamıyorum" gibi cevaplar (bunlar GEÇERLİ)
- Kısa ama anlamlı cevaplar ("evet", "mavi", "6 adım" gibi)

ŞÜPHELİYSEN valid=true VER. Yanlışlıkla geçerli bir cevabı reddetmek daha kötüdür.`;

    const userPrompt = `Görüşme: ${context.assessmentTitle}
Faz: ${context.currentPhase}
AI'ın son sorusu: "${context.lastAIMessage || '(yok)'}"
Adayın STT çıktısı: "${trimmed}"`;

    const response = await Promise.race([
      client.chat.completions.create({
        model: NANO_MODEL,
        max_completion_tokens: 50,
        temperature: 0,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('STT validation timeout')), TIMEOUT_MS)
      ),
    ]);

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.warn('[STTValidator] Empty response, allowing through');
      return { valid: true, cleanedText: trimmed, confidence: 0.5 };
    }

    const parsed = JSON.parse(content);
    const valid = parsed.valid !== false;
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;

    console.log(`[STTValidator] Result: valid=${valid}, confidence=${confidence.toFixed(2)}, text="${trimmed.substring(0, 50)}"`);

    if (!valid) {
      return {
        valid: false,
        retryMessage: 'Kusura bakmayın, sizi tam anlayamadım. Tekrar söyler misiniz?',
        confidence,
      };
    }

    return { valid: true, cleanedText: trimmed, confidence };
  } catch (error) {
    console.error('[STTValidator] Validation failed, allowing through:', error);
    return { valid: true, cleanedText: trimmed, confidence: 0.3 };
  }
}

function isObviousGibberish(text: string): boolean {
  const words = text.toLowerCase().split(/\s+/);
  if (words.length < 2) return false;

  // Detect excessive repetition (same word >60% of all words, min 4 occurrences)
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  for (const [, count] of freq) {
    if (count >= 4 && count / words.length > 0.6) return true;
  }

  return false;
}
