'use client';

import { useEffect, useState } from 'react';
import { useInterviewStore } from '@/stores/interviewStore';
import { AlertTriangle, Eye, Users } from 'lucide-react';

// ============================================
// CAMERA WARNING COMPONENT
// ============================================
// Non-intrusive warning banner when face is lost, gaze is away, or multiple faces.
// Auto-dismisses 2 seconds after the issue resolves.

const WARNING_CONFIG = {
  face_lost: { message: 'Yüzünüz görünmüyor. Lütfen kameraya dönün.', icon: AlertTriangle, bg: 'bg-red-500/90' },
  gaze_away: { message: 'Lütfen kameraya bakın.', icon: Eye, bg: 'bg-yellow-500/90' },
  multi_face: { message: 'Birden fazla kişi tespit edildi.', icon: Users, bg: 'bg-red-500/90' },
} as const;

export function CameraWarning() {
  const cameraWarning = useInterviewStore((s) => s.cameraWarning);
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (cameraWarning) {
      setVisible(true);
      setMessage(WARNING_CONFIG[cameraWarning].message);
    } else {
      const timer = setTimeout(() => setVisible(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [cameraWarning]);

  if (!visible) return null;

  const cfg = cameraWarning ? WARNING_CONFIG[cameraWarning] : null;
  const Icon = cfg?.icon ?? AlertTriangle;
  const bgColor = cfg?.bg ?? 'bg-green-500/90';

  return (
    <div
      className={`
        fixed top-4 left-1/2 -translate-x-1/2 z-50
        flex items-center gap-2 px-4 py-2 rounded-lg
        text-white text-sm font-medium shadow-lg
        transition-all duration-500
        ${bgColor}
        ${cameraWarning ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}
      `}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}
