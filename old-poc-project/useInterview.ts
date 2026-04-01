import { useRef, useCallback, useEffect } from 'react';
import { useInterviewStore } from '../store/interviewStore';
import { OpenAIService } from '../services/openai';
import { ElevenLabsService } from '../services/elevenlabs';
import { createSystemPrompt } from '../prompts/systemPrompt';
import { useWhisperRecognition } from './useWhisperRecognition';
import type { SimliAvatarRef } from '../components/SimliAvatar';

export function useInterview() {
  const store = useInterviewStore();
  const openaiRef = useRef<OpenAIService | null>(null);
  const elevenLabsRef = useRef<ElevenLabsService | null>(null);
  const simliRef = useRef<SimliAvatarRef | null>(null);
  const isProcessingRef = useRef(false);

  // Simli ref'ini set etmek için
  const setSimliRef = useCallback((ref: SimliAvatarRef | null) => {
    simliRef.current = ref;
  }, []);

  // TTS fonksiyonu - ElevenLabs + Simli
  const speakText = useCallback(async (text: string): Promise<void> => {
    if (!elevenLabsRef.current) {
      throw new Error('ElevenLabs servisi başlatılmadı');
    }

    const simliReady = simliRef.current?.isReady() ?? false;
    console.log('speakText called, simliReady:', simliReady);

    // Simli varsa, ElevenLabs audio'yu Simli'ye gönder
    if (simliReady && simliRef.current) {
      try {
        console.log('Getting audio from ElevenLabs for Simli...');
        // ElevenLabs'dan PCM16 audio al
        const audioData = await elevenLabsRef.current.getAudioForSimli(text);
        
        console.log('Total audio size:', audioData.length, 'bytes');
        
        // Simli 6000 byte chunk bekliyor (3000 sample = ~187ms @ 16kHz 16-bit)
        // Tüm chunk'ları hızlıca gönder - Simli kendi buffer'lamasını yapar
        const CHUNK_SIZE = 6000;
        const totalChunks = Math.ceil(audioData.length / CHUNK_SIZE);
        
        console.log(`Sending ${totalChunks} chunks to Simli...`);
        
        // Chunk'ları küçük aralıklarla gönder - buffer overflow'u önlemek için
        // Her chunk ~187ms audio, 50ms aralık = ~4x hızlı gönderim
        const SEND_INTERVAL = 50; // ms
        
        for (let i = 0; i < audioData.length; i += CHUNK_SIZE) {
          const chunk = audioData.slice(i, Math.min(i + CHUNK_SIZE, audioData.length));
          simliRef.current.sendAudioData(chunk);
          
          // Son chunk değilse kısa bekle
          if (i + CHUNK_SIZE < audioData.length) {
            await new Promise(resolve => setTimeout(resolve, SEND_INTERVAL));
          }
        }
        
        console.log('All chunks sent to Simli');
        
        // Audio süresini hesapla ve konuşma bitene kadar bekle
        // PCM16 @ 16kHz = 32000 bytes/saniye
        const audioDurationMs = (audioData.length / 32000) * 1000;
        const waitTime = audioDurationMs + 500; // +500ms buffer
        console.log('Waiting for speech to finish:', waitTime, 'ms');
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
      } catch (error) {
        console.error('Simli/ElevenLabs error:', error);
        // Fallback: sadece ElevenLabs ile ses çal
        console.log('Falling back to ElevenLabs only...');
        await elevenLabsRef.current.speak(text);
      }
    } else {
      // Simli hazır değilse sadece ElevenLabs kullan
      console.log('Simli not ready, using ElevenLabs only');
      await elevenLabsRef.current.speak(text);
    }
  }, []);

  const processUserResponse = useCallback(async (transcript: string) => {
    if (!openaiRef.current || isProcessingRef.current) return;
    
    isProcessingRef.current = true;

    // Kullanıcı cevabını transcript'e ekle
    store.addTranscript({
      role: 'user',
      text: transcript,
      phase: store.phase || undefined,
      questionNumber: store.questionNumber
    });

    store.setState('processing');

    try {
      // GPT'den yeni soru al
      const response = await openaiRef.current.chat(transcript);

      // AI cevabını transcript'e ekle
      store.addTranscript({
        role: 'ai',
        text: response.message,
        phase: response.phase,
        questionNumber: response.questionNumber
      });

      store.setPhase(response.phase);
      store.setQuestionNumber(response.questionNumber);
      store.setTotalQuestions(response.totalQuestions);

      // Görüşme bittiyse sonucu kaydet
      if (response.isLastQuestion && response.score) {
        store.setResult({
          score: response.score,
          summary: response.summary || '',
          strengths: response.strengths || [],
          improvements: response.improvements || [],
          recommendation: response.recommendation || ''
        });
      }

      // TTS ile konuş (ElevenLabs + Simli)
      store.setState('speaking');
      await speakText(response.message);
      
      // Konuşma bitti
      isProcessingRef.current = false;
      
      if (store.result) {
        store.setState('completed');
      } else {
        store.setState('listening');
      }

    } catch (error) {
      store.setError(error instanceof Error ? error.message : 'Bilinmeyen bir hata oluştu');
      store.setState('idle');
      isProcessingRef.current = false;
    }
  }, [store, speakText]);

  const whisperRecognition = useWhisperRecognition({
    apiKey: store.openaiKey,
    onResult: processUserResponse,
    onError: (error) => store.setError(error)
  });

  // State 'listening' olduğunda otomatik olarak kayda başla
  useEffect(() => {
    if (store.state === 'listening' && !whisperRecognition.isRecording && !whisperRecognition.isProcessing && !isProcessingRef.current) {
      whisperRecognition.startRecording();
    }
  }, [store.state, whisperRecognition.isRecording, whisperRecognition.isProcessing, whisperRecognition]);

  const startInterview = useCallback(async () => {
    // API key kontrolü
    if (!store.openaiKey) {
      store.setError('Lütfen OpenAI API anahtarını girin');
      return;
    }

    if (!store.elevenLabsKey) {
      store.setError('Lütfen ElevenLabs API anahtarını girin');
      return;
    }

    // JSON parse kontrolü
    const candidate = store.parseCandidate();
    const job = store.parseJob();

    if (!candidate || !job) {
      store.setError('Geçersiz JSON formatı. Lütfen kontrol edin.');
      return;
    }

    // Reset state
    store.reset();
    store.setState('processing');
    isProcessingRef.current = false;

    try {
      // Servisleri başlat
      openaiRef.current = new OpenAIService(store.openaiKey);
      elevenLabsRef.current = new ElevenLabsService(store.elevenLabsKey);

      // Simli'yi başlat ve bağlanmasını bekle
      if (simliRef.current) {
        console.log('Starting Simli connection...');
        await simliRef.current.start();
        
        // Simli'nin bağlanmasını bekle (max 5 saniye)
        const maxWait = 5000;
        const startTime = Date.now();
        while (!simliRef.current.isReady() && (Date.now() - startTime) < maxWait) {
          console.log('Waiting for Simli to connect...');
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        if (simliRef.current.isReady()) {
          console.log('Simli connected and ready!');
        } else {
          console.warn('Simli connection timeout, will use ElevenLabs fallback');
        }
      }

      // System prompt'u ayarla
      const systemPrompt = createSystemPrompt(candidate, job);
      openaiRef.current.setSystemPrompt(systemPrompt);

      // İlk mesajı al
      const response = await openaiRef.current.chat();

      // AI cevabını transcript'e ekle
      store.addTranscript({
        role: 'ai',
        text: response.message,
        phase: response.phase,
        questionNumber: response.questionNumber
      });

      store.setPhase(response.phase);
      store.setQuestionNumber(response.questionNumber);
      store.setTotalQuestions(response.totalQuestions);

      // TTS ile konuş
      store.setState('speaking');
      await speakText(response.message);
      
      // Konuşma bitti, dinleme moduna geç
      isProcessingRef.current = false;
      store.setState('listening');

    } catch (error) {
      store.setError(error instanceof Error ? error.message : 'Bilinmeyen bir hata oluştu');
      store.setState('idle');
    }
  }, [store, speakText]);

  const stopInterview = useCallback(() => {
    whisperRecognition.stopRecording();
    elevenLabsRef.current?.stop();
    simliRef.current?.close();
    openaiRef.current?.reset();
    store.setState('idle');
  }, [store, whisperRecognition]);

  const finishResponse = useCallback(() => {
    whisperRecognition.stopRecording();
  }, [whisperRecognition]);

  const skipQuestion = useCallback(async () => {
    if (!openaiRef.current || isProcessingRef.current) return;
    
    // Kaydı durdur
    whisperRecognition.stopRecording();
    
    isProcessingRef.current = true;

    // "Soruyu atlıyorum" mesajını ekle
    store.addTranscript({
      role: 'user',
      text: '[Bu soruyu atladı]',
      phase: store.phase || undefined,
      questionNumber: store.questionNumber
    });

    store.setState('processing');

    try {
      // GPT'ye soruyu atladığını bildir
      const response = await openaiRef.current.chat('Bu soruyu atlamak istiyorum, bir sonraki soruya geçelim.');

      // AI cevabını transcript'e ekle
      store.addTranscript({
        role: 'ai',
        text: response.message,
        phase: response.phase,
        questionNumber: response.questionNumber
      });

      store.setPhase(response.phase);
      store.setQuestionNumber(response.questionNumber);
      store.setTotalQuestions(response.totalQuestions);

      // Görüşme bittiyse sonucu kaydet
      if (response.isLastQuestion && response.score) {
        store.setResult({
          score: response.score,
          summary: response.summary || '',
          strengths: response.strengths || [],
          improvements: response.improvements || [],
          recommendation: response.recommendation || ''
        });
      }

      // TTS ile konuş
      store.setState('speaking');
      await speakText(response.message);
      
      isProcessingRef.current = false;
      
      if (store.result) {
        store.setState('completed');
      } else {
        store.setState('listening');
      }

    } catch (error) {
      store.setError(error instanceof Error ? error.message : 'Bilinmeyen bir hata oluştu');
      store.setState('idle');
      isProcessingRef.current = false;
    }
  }, [store, whisperRecognition, speakText]);

  return {
    startInterview,
    stopInterview,
    finishResponse,
    skipQuestion,
    setSimliRef,
    isListening: whisperRecognition.isRecording,
    isProcessing: whisperRecognition.isProcessing
  };
}
