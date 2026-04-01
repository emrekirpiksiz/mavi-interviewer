import { useRef, useCallback } from 'react';
import { APIKeyInput } from './components/APIKeyInput';
import { JsonInputPanel } from './components/JsonInputPanel';
import { TranscriptView } from './components/TranscriptView';
import { InterviewControls } from './components/InterviewControls';
import { StatusBar } from './components/StatusBar';
import { ScoreCard } from './components/ScoreCard';
import { SimliAvatar } from './components/SimliAvatar';
import type { SimliAvatarRef } from './components/SimliAvatar';
import { useInterview } from './hooks/useInterview';
import { useInterviewStore } from './store/interviewStore';

function App() {
  const simliRef = useRef<SimliAvatarRef>(null);
  const { 
    startInterview, 
    stopInterview, 
    finishResponse, 
    skipQuestion,
    setSimliRef,
    isListening, 
    isProcessing 
  } = useInterview();
  const { state, didApiKey } = useInterviewStore();

  // Simli hazır olduğunda ref'i set et
  const handleSimliReady = useCallback(() => {
    if (simliRef.current) {
      setSimliRef(simliRef.current);
    }
  }, [setSimliRef]);

  const handleSimliError = useCallback((error: string) => {
    console.error('Simli error:', error);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Background Pattern */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-violet-500/5 rounded-full blur-3xl" />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <header className="text-center mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-1 flex items-center justify-center gap-3">
            <span className="text-3xl">🎙️</span>
            <span className="gradient-text">AI İş Görüşmesi</span>
          </h1>
          <p className="text-slate-400 text-sm">
            GPT-4o-mini + OpenAI Whisper + Simli Avatar + ElevenLabs TTS
          </p>
        </header>

        {/* Main Grid - 3 columns */}
        <div className="flex flex-col gap-4" style={{ flexDirection: 'row' }}>
          {/* Left Column - API Keys & JSON */}
          <div className="space-y-4 flex-shrink-0" style={{ width: '25%' }}>
            <APIKeyInput />
            <div style={{ height: 'calc(100vh - 380px)', minHeight: '250px' }}>
              <JsonInputPanel />
            </div>
          </div>

          {/* Middle Column - Simli Avatar */}
          <div className="flex flex-col gap-4" style={{ width: '35%' }}>
            <div className="glass rounded-xl overflow-hidden" style={{ height: '350px' }}>
              <SimliAvatar
                ref={simliRef}
                apiKey={didApiKey}
                onReady={handleSimliReady}
                onError={handleSimliError}
              />
            </div>
            
            {/* Controls under avatar */}
            <div className="glass rounded-xl p-4">
              <StatusBar isListening={isListening} />
              <InterviewControls
                onStart={startInterview}
                onStop={stopInterview}
                onFinishResponse={finishResponse}
                onSkipQuestion={skipQuestion}
                isListening={isListening}
                isProcessing={isProcessing}
              />
            </div>
          </div>

          {/* Right Column - Transcript & Score */}
          <div className="flex flex-col gap-4" style={{ width: '40%' }}>
            {/* Transcript Panel */}
            <div className="glass rounded-xl p-4 flex flex-col" style={{ height: 'calc(100vh - 200px)', minHeight: '400px' }}>
              <TranscriptView isListening={isListening} />
            </div>

            {/* Score Card */}
            {state === 'completed' && <ScoreCard />}
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-6 text-center text-slate-500 text-xs">
          <p>
            POC Uygulaması • API anahtarlarınız sadece tarayıcınızda kullanılır
          </p>
        </footer>
      </div>
    </div>
  );
}

export default App;
