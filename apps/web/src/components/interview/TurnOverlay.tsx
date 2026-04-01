'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Mic, Bot, Loader2 } from 'lucide-react';
import type { InterviewState } from '@/stores/interviewStore';

interface TurnOverlayProps {
  interviewState: InterviewState;
  isAudioPlaying: boolean;
}

type OverlayType = 'candidate' | 'ai_thinking' | null;

const CANDIDATE_DURATION_S = 4;
const AI_DURATION_S = 3;

export function TurnOverlay({
  interviewState,
  isAudioPlaying,
}: TurnOverlayProps) {
  const [visible, setVisible] = useState<OverlayType>(null);
  const [fading, setFading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const prevStateRef = useRef<InterviewState>(interviewState);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fadeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  const clearAllTimers = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (fadeTimerRef.current) { clearTimeout(fadeTimerRef.current); fadeTimerRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  }, []);

  const showOverlay = useCallback((type: OverlayType, durationS: number) => {
    clearAllTimers();
    setFading(false);
    setVisible(type);
    setCountdown(durationS);
    setTotalDuration(durationS);

    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    timerRef.current = setTimeout(() => {
      setFading(true);
      fadeTimerRef.current = setTimeout(() => setVisible(null), 300);
    }, durationS * 1000);
  }, [clearAllTimers]);

  const hideOverlay = useCallback(() => {
    clearAllTimers();
    setFading(true);
    fadeTimerRef.current = setTimeout(() => setVisible(null), 200);
  }, [clearAllTimers]);

  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = interviewState;

    if (prev === interviewState) return;

    if (interviewState === 'waiting_candidate' && !isAudioPlaying) {
      const aiStates: InterviewState[] = ['ai_generating', 'ai_speaking'];
      if (aiStates.includes(prev)) {
        showOverlay('candidate', CANDIDATE_DURATION_S);
        return;
      }
    }

    if (interviewState === 'ai_generating') {
      const candidateStates: InterviewState[] = ['waiting_candidate', 'candidate_speaking', 'processing'];
      if (candidateStates.includes(prev)) {
        showOverlay('ai_thinking', AI_DURATION_S);
        return;
      }
    }

    if (interviewState === 'ai_speaking') {
      hideOverlay();
    }
  }, [interviewState, isAudioPlaying, showOverlay, hideOverlay]);

  useEffect(() => {
    return () => clearAllTimers();
  }, [clearAllTimers]);

  if (!visible) return null;

  const progressPercent = totalDuration > 0 ? (countdown / totalDuration) * 100 : 0;

  return (
    <div
      className={`
        absolute inset-0 z-40 flex items-center justify-center
        bg-black/50 backdrop-blur-sm
        ${fading ? 'animate-overlay-out' : 'animate-overlay-in'}
      `}
    >
      {visible === 'candidate' ? (
        <div className="text-center space-y-5 px-8">
          <div className="w-24 h-24 mx-auto rounded-full bg-green-500/20 border-2 border-green-500/50 flex items-center justify-center">
            <Mic className="w-12 h-12 text-green-400" />
          </div>
          <h2 className="text-4xl font-bold text-green-400">SIRA SİZDE</h2>
          <div className="space-y-2 max-w-sm mx-auto">
            <p className="text-xl text-green-300">Konuşabilirsiniz.</p>
            <p className="text-base text-green-300/80 leading-relaxed">
              Cevabınızı verdikten sonra mikrofon tuşuna basarak cevabınızı iletin.
            </p>
          </div>
          <CountdownRing countdown={countdown} total={totalDuration} color="green" />
        </div>
      ) : (
        <div className="text-center space-y-5 px-8">
          <div className="w-24 h-24 mx-auto rounded-full bg-blue-500/20 border-2 border-blue-500/50 flex items-center justify-center">
            <Bot className="w-12 h-12 text-blue-400" />
          </div>
          <h2 className="text-4xl font-bold text-blue-400">SIRA AI&apos;DA</h2>
          <div className="flex items-center justify-center gap-2 text-xl text-blue-300">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>Düşünüyor...</span>
          </div>
          <CountdownRing countdown={countdown} total={totalDuration} color="blue" />
        </div>
      )}
    </div>
  );
}

function CountdownRing({ countdown, total, color }: { countdown: number; total: number; color: 'green' | 'blue' }) {
  if (countdown <= 0) return null;

  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const progress = countdown / total;
  const strokeDashoffset = circumference * (1 - progress);

  const colors = color === 'green'
    ? { ring: 'stroke-green-500', track: 'stroke-green-500/20', text: 'text-green-400' }
    : { ring: 'stroke-blue-500', track: 'stroke-blue-500/20', text: 'text-blue-400' };

  return (
    <div className="flex justify-center pt-1">
      <div className="relative w-16 h-16">
        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={radius} fill="none" strokeWidth="3" className={colors.track} />
          <circle
            cx="32" cy="32" r={radius} fill="none" strokeWidth="3"
            className={`${colors.ring} transition-all duration-1000 ease-linear`}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
          />
        </svg>
        <span className={`absolute inset-0 flex items-center justify-center text-2xl font-bold tabular-nums ${colors.text}`}>
          {countdown}
        </span>
      </div>
    </div>
  );
}
