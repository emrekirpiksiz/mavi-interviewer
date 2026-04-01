'use client';

import { useCallback, useRef, useState } from 'react';

// ============================================
// CAMERA HOOK
// ============================================
// Manages camera stream lifecycle: permission, start, stop, cleanup.
// Returns a MediaStream that can be attached to a <video> element.

export interface UseCameraReturn {
  stream: MediaStream | null;
  isActive: boolean;
  error: string | null;
  requestPermission: () => Promise<boolean>;
  startCamera: (videoEl?: HTMLVideoElement | null) => Promise<MediaStream | null>;
  stopCamera: () => void;
}

const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: 'user',
    width: { ideal: 640 },
    height: { ideal: 480 },
  },
  audio: false,
};

export function useCamera(): UseCameraReturn {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
      // Stop all tracks immediately - this was just for permission
      tempStream.getTracks().forEach((t) => t.stop());
      setError(null);
      return true;
    } catch (err) {
      const message = err instanceof DOMException && err.name === 'NotAllowedError'
        ? 'Kamera izni reddedildi'
        : 'Kamera erişilemiyor';
      setError(message);
      return false;
    }
  }, []);

  const startCamera = useCallback(async (videoEl?: HTMLVideoElement | null): Promise<MediaStream | null> => {
    try {
      // If already active, return existing stream
      if (streamRef.current) {
        return streamRef.current;
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
      streamRef.current = mediaStream;
      setStream(mediaStream);
      setIsActive(true);
      setError(null);

      if (videoEl) {
        videoEl.srcObject = mediaStream;
      }

      return mediaStream;
    } catch (err) {
      const message = err instanceof DOMException && err.name === 'NotAllowedError'
        ? 'Kamera izni reddedildi'
        : 'Kamera başlatılamadı';
      setError(message);
      setIsActive(false);
      return null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setStream(null);
    setIsActive(false);
  }, []);

  return {
    stream,
    isActive,
    error,
    requestPermission,
    startCamera,
    stopCamera,
  };
}
