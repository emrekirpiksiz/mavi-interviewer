'use client';

import { useCallback, useRef, useState } from 'react';

// ============================================
// VIDEO RECORDING HOOK
// ============================================
// Records the candidate's camera stream using MediaRecorder.
// Accumulates chunks and uploads the combined blob when stopped.

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface UseVideoRecordingReturn {
  isRecording: boolean;
  startRecording: (stream: MediaStream) => void;
  stopRecording: () => Blob | null;
  uploadVideo: (sessionId: string) => Promise<boolean>;
}

const TIMESLICE_MS = 5000; // Collect data every 5 seconds

function getPreferredMimeType(): string {
  const types = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

export function useVideoRecording(): UseVideoRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const finalBlobRef = useRef<Blob | null>(null);

  const startRecording = useCallback((stream: MediaStream) => {
    if (recorderRef.current) return;

    chunksRef.current = [];
    finalBlobRef.current = null;

    const mimeType = getPreferredMimeType();
    const recorder = new MediaRecorder(stream, {
      mimeType: mimeType || undefined,
      videoBitsPerSecond: 1_000_000, // 1 Mbps
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      const mime = mimeType || 'video/webm';
      finalBlobRef.current = new Blob(chunksRef.current, { type: mime });
      setIsRecording(false);
    };

    recorder.start(TIMESLICE_MS);
    recorderRef.current = recorder;
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback((): Blob | null => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      // Already stopped - return whatever we have
      if (chunksRef.current.length > 0) {
        finalBlobRef.current = new Blob(chunksRef.current, { type: 'video/webm' });
      }
      return finalBlobRef.current;
    }

    recorder.stop();
    recorderRef.current = null;

    // The onstop callback fires asynchronously, so build the blob here too
    if (chunksRef.current.length > 0) {
      finalBlobRef.current = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
    }

    return finalBlobRef.current;
  }, []);

  const uploadVideo = useCallback(async (sessionId: string): Promise<boolean> => {
    const blob = finalBlobRef.current;
    if (!blob || blob.size === 0) {
      console.warn('[VideoRecording] No video data to upload');
      return false;
    }

    try {
      const formData = new FormData();
      formData.append('video', blob, `${sessionId}.webm`);

      const response = await fetch(`${API_URL}/sessions/${sessionId}/video`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        console.error('[VideoRecording] Upload failed:', response.status);
        return false;
      }

      console.log(`[VideoRecording] Upload initiated for session ${sessionId}`);
      return true;
    } catch (error) {
      console.error('[VideoRecording] Upload error:', error);
      return false;
    }
  }, []);

  return {
    isRecording,
    startRecording,
    stopRecording,
    uploadVideo,
  };
}
