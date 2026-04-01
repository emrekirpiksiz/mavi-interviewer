'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CameraIntegrityType } from '@ai-interview/shared';

// ============================================
// FACE DETECTION HOOK
// ============================================
// Uses MediaPipe Face Landmarker for real-time face presence and gaze detection.
// Runs entirely client-side at ~3 FPS to minimize CPU usage.
// MediaPipe is loaded from CDN at runtime to avoid bundler issues with WASM.

export interface FaceDetectionConfig {
  faceLostThresholdMs?: number;
  gazeAwayThresholdMs?: number;
  detectionIntervalMs?: number;
}

export interface FaceDetectionDebugData {
  faceCount: number;
  gazeRatio: number | null;
  headYaw: number | null;
  isLookingAtCamera: boolean;
  faceLostElapsedMs: number | null;
  gazeAwayElapsedMs: number | null;
  fps: number;
  modelLoaded: boolean;
  faceLostCount: number;
  gazeAwayCount: number;
  multiFaceCount: number;
}

export interface UseFaceDetectionReturn {
  faceDetected: boolean;
  gazeOnCamera: boolean;
  isRunning: boolean;
  debugData: FaceDetectionDebugData;
  start: (videoEl: HTMLVideoElement) => Promise<void>;
  stop: () => void;
}

const DEFAULT_CONFIG: Required<FaceDetectionConfig> = {
  faceLostThresholdMs: 5000,
  gazeAwayThresholdMs: 5000,
  detectionIntervalMs: 333,
};

// Iris gaze ratio: position within the eye (0=outer, 1=inner). Center ≈ 0.5
const GAZE_MIN = 0.4;
const GAZE_MAX = 0.6;

// Head yaw: nose displacement from face center. 0=straight, ±1=fully turned
const HEAD_YAW_THRESHOLD = 0.5;

// Iris / eye landmark indices (478-landmark face mesh with iris refinement)
const LEFT_IRIS_CENTER = 468;
const RIGHT_IRIS_CENTER = 473;
const LEFT_EYE_OUTER = 33;
const LEFT_EYE_INNER = 133;
const RIGHT_EYE_OUTER = 362;
const RIGHT_EYE_INNER = 263;

// Head pose landmarks (available in the base 468 landmarks)
const NOSE_TIP = 1;
const LEFT_CHEEK = 234;
const RIGHT_CHEEK = 454;

interface Landmark { x: number; y: number; z: number }

interface GazeResult {
  looking: boolean;
  irisRatio: number | null;
  headYaw: number | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FaceLandmarkerInstance = any;

type IntegrityCallback = (type: CameraIntegrityType) => void;

// Estimates head yaw from nose displacement relative to face width.
// Returns value in [-1, 1] range: 0=straight, negative=left, positive=right
function estimateHeadYaw(landmarks: Landmark[]): number | null {
  if (landmarks.length < 455) return null;

  const nose = landmarks[NOSE_TIP]!;
  const leftCheek = landmarks[LEFT_CHEEK]!;
  const rightCheek = landmarks[RIGHT_CHEEK]!;

  const faceWidth = rightCheek.x - leftCheek.x;
  if (faceWidth <= 0) return null;

  const faceCenter = (leftCheek.x + rightCheek.x) / 2;
  return (nose.x - faceCenter) / (faceWidth / 2);
}

async function loadFaceLandmarker(): Promise<FaceLandmarkerInstance> {
  // Load MediaPipe via CDN script tag to bypass bundler issues
  const VISION_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs';
  const vision = await import(/* webpackIgnore: true */ VISION_CDN);
  const { FaceLandmarker, FilesetResolver } = vision;

  const filesetResolver = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
  );

  return FaceLandmarker.createFromOptions(filesetResolver, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numFaces: 2,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  });
}

export function useFaceDetection(
  config?: FaceDetectionConfig,
  onIntegrityChange?: IntegrityCallback
): UseFaceDetectionReturn {
  const [faceDetected, setFaceDetected] = useState(true);
  const [gazeOnCamera, setGazeOnCamera] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [debugData, setDebugData] = useState<FaceDetectionDebugData>({
    faceCount: 0, gazeRatio: null, headYaw: null, isLookingAtCamera: true,
    faceLostElapsedMs: null, gazeAwayElapsedMs: null, fps: 0, modelLoaded: false,
    faceLostCount: 0, gazeAwayCount: 0, multiFaceCount: 0,
  });
  const faceLostCountRef = useRef(0);
  const gazeAwayCountRef = useRef(0);
  const multiFaceCountRef = useRef(0);
  const multiFaceStateRef = useRef(false);

  const cfg = { ...DEFAULT_CONFIG, ...config };
  const faceLandmarkerRef = useRef<FaceLandmarkerInstance>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastFrameTimeRef = useRef<number>(0);

  const faceLostSinceRef = useRef<number | null>(null);
  const gazeAwaySinceRef = useRef<number | null>(null);
  const faceStateRef = useRef(true);
  const gazeStateRef = useRef(true);
  const onIntegrityChangeRef = useRef(onIntegrityChange);
  onIntegrityChangeRef.current = onIntegrityChange;

  const estimateGaze = useCallback((landmarks: Landmark[]): GazeResult => {
    // Head yaw estimation works with the base 468 landmarks (always available)
    const headYaw = estimateHeadYaw(landmarks);
    const headTurned = headYaw !== null && Math.abs(headYaw) > HEAD_YAW_THRESHOLD;

    // Iris tracking needs the full 478 landmarks (iris refinement)
    let irisRatio: number | null = null;
    let irisOff = false;

    if (landmarks.length >= 478) {
      const leftIris = landmarks[LEFT_IRIS_CENTER]!;
      const rightIris = landmarks[RIGHT_IRIS_CENTER]!;
      const leftOuter = landmarks[LEFT_EYE_OUTER]!;
      const leftInner = landmarks[LEFT_EYE_INNER]!;
      const rightOuter = landmarks[RIGHT_EYE_OUTER]!;
      const rightInner = landmarks[RIGHT_EYE_INNER]!;

      const leftEyeWidth = leftInner.x - leftOuter.x;
      const rightEyeWidth = rightInner.x - rightOuter.x;

      if (leftEyeWidth > 0 && rightEyeWidth > 0) {
        const leftIrisRatio = (leftIris.x - leftOuter.x) / leftEyeWidth;
        const rightIrisRatio = (rightIris.x - rightOuter.x) / rightEyeWidth;
        irisRatio = (leftIrisRatio + rightIrisRatio) / 2;
        irisOff = irisRatio < GAZE_MIN || irisRatio > GAZE_MAX;
      }
    }

    // Looking at camera = head is facing forward AND (iris data unavailable OR iris is centered)
    const looking = !headTurned && !irisOff;

    return { looking, irisRatio, headYaw };
  }, []);

  const processFrame = useCallback(() => {
    const landmarker = faceLandmarkerRef.current;
    const video = videoRef.current;
    if (!landmarker || !video || video.readyState < 2) return;

    const now = Date.now();
    const deltaMs = lastFrameTimeRef.current ? now - lastFrameTimeRef.current : 0;
    const fps = deltaMs > 0 ? 1000 / deltaMs : 0;
    lastFrameTimeRef.current = now;

    try {
      const results = landmarker.detectForVideo(video, now);
      const faceCount = results.faceLandmarks.length;
      const hasFace = faceCount > 0;

      // Gaze is only estimated when exactly one face is present
      const gazeResult: GazeResult = hasFace && faceCount === 1
        ? estimateGaze(results.faceLandmarks[0]!)
        : { looking: false, irisRatio: null, headYaw: null };
      const isLookingAtCamera = hasFace ? gazeResult.looking : false;

      // --- Face presence tracking (with threshold) ---
      if (hasFace) {
        faceLostSinceRef.current = null;
        if (!faceStateRef.current) {
          faceStateRef.current = true;
          setFaceDetected(true);
          onIntegrityChangeRef.current?.('face_restored');
        }
      } else {
        if (faceLostSinceRef.current === null) faceLostSinceRef.current = now;
        if (faceStateRef.current && now - faceLostSinceRef.current >= cfg.faceLostThresholdMs) {
          faceStateRef.current = false;
          faceLostCountRef.current += 1;
          setFaceDetected(false);
          onIntegrityChangeRef.current?.('face_lost');
        }
      }

      // --- Gaze tracking (only when face IS present) ---
      // When face is absent, gaze timer is paused — face_lost already covers that case.
      if (hasFace) {
        if (isLookingAtCamera) {
          gazeAwaySinceRef.current = null;
          if (!gazeStateRef.current) {
            gazeStateRef.current = true;
            setGazeOnCamera(true);
            onIntegrityChangeRef.current?.('gaze_restored');
          }
        } else {
          if (gazeAwaySinceRef.current === null) gazeAwaySinceRef.current = now;
          if (gazeStateRef.current && now - gazeAwaySinceRef.current >= cfg.gazeAwayThresholdMs) {
            gazeStateRef.current = false;
            gazeAwayCountRef.current += 1;
            setGazeOnCamera(false);
            onIntegrityChangeRef.current?.('gaze_away');
          }
        }
      } else {
        // Face lost — pause gaze timer (don't accumulate time while face is absent)
        gazeAwaySinceRef.current = null;
      }

      // --- Multi-face detection (instant, no threshold) ---
      if (faceCount > 1 && !multiFaceStateRef.current) {
        multiFaceStateRef.current = true;
        multiFaceCountRef.current += 1;
        onIntegrityChangeRef.current?.('multi_face');
      } else if (faceCount <= 1 && multiFaceStateRef.current) {
        multiFaceStateRef.current = false;
        onIntegrityChangeRef.current?.('multi_face_restored');
      }

      setDebugData({
        faceCount,
        gazeRatio: gazeResult.irisRatio,
        headYaw: gazeResult.headYaw,
        isLookingAtCamera,
        faceLostElapsedMs: faceLostSinceRef.current ? now - faceLostSinceRef.current : null,
        gazeAwayElapsedMs: gazeAwaySinceRef.current ? now - gazeAwaySinceRef.current : null,
        fps,
        modelLoaded: true,
        faceLostCount: faceLostCountRef.current,
        gazeAwayCount: gazeAwayCountRef.current,
        multiFaceCount: multiFaceCountRef.current,
      });
    } catch {
      // Non-fatal - skip frame
    }
  }, [cfg.faceLostThresholdMs, cfg.gazeAwayThresholdMs, estimateGaze]);

  const start = useCallback(async (videoEl: HTMLVideoElement) => {
    videoRef.current = videoEl;

    if (!faceLandmarkerRef.current) {
      try {
        faceLandmarkerRef.current = await loadFaceLandmarker();
      } catch (err) {
        console.error('[FaceDetection] Failed to load MediaPipe:', err);
        return;
      }
    }

    faceLostSinceRef.current = null;
    gazeAwaySinceRef.current = null;
    faceStateRef.current = true;
    gazeStateRef.current = true;
    multiFaceStateRef.current = false;
    faceLostCountRef.current = 0;
    gazeAwayCountRef.current = 0;
    multiFaceCountRef.current = 0;
    setFaceDetected(true);
    setGazeOnCamera(true);
    setIsRunning(true);

    intervalRef.current = setInterval(processFrame, cfg.detectionIntervalMs);
  }, [processFrame, cfg.detectionIntervalMs]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
  }, []);

  useEffect(() => {
    return () => {
      stop();
      if (faceLandmarkerRef.current) {
        try { faceLandmarkerRef.current.close(); } catch { /* */ }
        faceLandmarkerRef.current = null;
      }
    };
  }, [stop]);

  return { faceDetected, gazeOnCamera, isRunning, debugData, start, stop };
}
