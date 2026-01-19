import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type RecorderStatus = 'idle' | 'recording' | 'preview';

const pickMimeType = (): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  const MR = (window as any).MediaRecorder as typeof MediaRecorder | undefined;
  if (!MR || typeof MR.isTypeSupported !== 'function') return undefined;

  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];

  return candidates.find((t) => {
    try {
      return MR.isTypeSupported(t);
    } catch {
      return false;
    }
  });
};

const getDurationMs = async (blob: Blob): Promise<number | undefined> => {
  if (typeof window === 'undefined') return undefined;

  const url = URL.createObjectURL(blob);
  try {
    const durationFromAudio = await new Promise<number>((resolve, reject) => {
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.src = url;
      audio.onloadedmetadata = () => resolve(audio.duration);
      audio.onerror = () => reject(new Error('Failed to read audio metadata'));
    });

    if (Number.isFinite(durationFromAudio) && durationFromAudio > 0 && durationFromAudio !== Infinity) {
      return Math.round(durationFromAudio * 1000);
    }

    // Fallback: decode audio data if metadata duration is unreliable.
    const arrayBuffer = await blob.arrayBuffer();
    const AudioContextCtor = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return undefined;
    const ctx = new AudioContextCtor();
    try {
      const audioBuffer: AudioBuffer = await new Promise((resolve, reject) => {
        ctx.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
      });
      if (Number.isFinite(audioBuffer.duration) && audioBuffer.duration > 0) {
        return Math.round(audioBuffer.duration * 1000);
      }
      return undefined;
    } finally {
      try {
        await ctx.close();
      } catch {
        // ignore
      }
    }
  } finally {
    URL.revokeObjectURL(url);
  }
};

export type VoicePreview = {
  blob: Blob;
  blobUrl: string;
  mimeType: string;
  size: number;
  durationMs?: number;
};

export const useVoiceRecorder = () => {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<VoicePreview | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef<number>(0);

  const canRecord = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return !!(navigator.mediaDevices?.getUserMedia && (window as any).MediaRecorder);
  }, []);

  const cleanupStream = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    if (!stream) return;
    for (const t of stream.getTracks()) {
      try {
        t.stop();
      } catch {
        // ignore
      }
    }
  }, []);

  const clearPreview = useCallback(() => {
    setPreview((prev) => {
      if (prev?.blobUrl) URL.revokeObjectURL(prev.blobUrl);
      return null;
    });
  }, []);

  useEffect(() => {
    if (status !== 'recording') return;
    const id = window.setInterval(() => {
      const startedAt = startedAtRef.current;
      if (!startedAt) return;
      setElapsedMs(Date.now() - startedAt);
    }, 200);
    return () => window.clearInterval(id);
  }, [status]);

  useEffect(() => {
    return () => {
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        // ignore
      }
      cleanupStream();
      clearPreview();
    };
  }, [cleanupStream, clearPreview]);

  const start = useCallback(async () => {
    setError(null);
    if (!canRecord) {
      setError('This browser does not support voice recording.');
      return;
    }
    if (status === 'recording') return;

    clearPreview();
    setElapsedMs(0);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev: BlobEvent) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      startedAtRef.current = Date.now();
      setStatus('recording');
      recorder.start();
    } catch (e: any) {
      cleanupStream();
      setStatus('idle');
      setError(e?.message || 'Failed to start recording.');
    }
  }, [canRecord, cleanupStream, clearPreview, status]);

  const stop = useCallback(async () => {
    setError(null);
    const recorder = mediaRecorderRef.current;
    if (!recorder || status !== 'recording') return;

    const blob: Blob | null = await new Promise((resolve) => {
      recorder.onstop = () => {
        try {
          const mimeType = recorder.mimeType || pickMimeType() || 'audio/webm';
          resolve(new Blob(chunksRef.current, { type: mimeType }));
        } catch {
          resolve(null);
        }
      };
      try {
        recorder.stop();
      } catch {
        resolve(null);
      }
    });

    cleanupStream();
    mediaRecorderRef.current = null;
    startedAtRef.current = 0;

    if (!blob || blob.size <= 0) {
      setStatus('idle');
      setError('Recording failed or was empty.');
      return;
    }

    const blobUrl = URL.createObjectURL(blob);
    const durationMs = await getDurationMs(blob).catch(() => undefined);
    setPreview({
      blob,
      blobUrl,
      mimeType: blob.type || 'audio/webm',
      size: blob.size,
      ...(durationMs ? { durationMs } : {}),
    });
    setStatus('preview');
  }, [cleanupStream, status]);

  const cancel = useCallback(() => {
    setError(null);
    try {
      mediaRecorderRef.current?.stop();
    } catch {
      // ignore
    }
    mediaRecorderRef.current = null;
    startedAtRef.current = 0;
    chunksRef.current = [];
    cleanupStream();
    clearPreview();
    setElapsedMs(0);
    setStatus('idle');
  }, [cleanupStream, clearPreview]);

  const loadFromFile = useCallback(
    async (file: File) => {
      setError(null);
      if (!file) return;
      const mimeType = file.type || 'audio/webm';
      if (!mimeType.startsWith('audio/')) {
        setError('Please select an audio file.');
        return;
      }

      // Stop any ongoing recording, and replace preview.
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        // ignore
      }
      mediaRecorderRef.current = null;
      startedAtRef.current = 0;
      chunksRef.current = [];
      cleanupStream();
      clearPreview();
      setElapsedMs(0);

      const blobUrl = URL.createObjectURL(file);
      const durationMs = await getDurationMs(file).catch(() => undefined);
      setPreview({
        blob: file,
        blobUrl,
        mimeType,
        size: file.size,
        ...(durationMs ? { durationMs } : {}),
      });
      setStatus('preview');
    },
    [cleanupStream, clearPreview]
  );

  return {
    canRecord,
    status,
    error,
    preview,
    elapsedMs,
    start,
    stop,
    cancel,
    loadFromFile,
    clearPreview,
    setError,
    setStatus,
  };
};
