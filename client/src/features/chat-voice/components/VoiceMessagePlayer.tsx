import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import clsx from 'clsx';

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
};

type Props = {
  src: string;
  contentType?: string;
  durationMs?: number;
  className?: string;
};

export const VoiceMessagePlayer = ({ src, contentType, durationMs, className }: Props) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState<number>(durationMs ? durationMs / 1000 : 0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  const rates = useMemo(() => [0.5, 1, 1.5, 2] as const, []);
  const [rateIndex, setRateIndex] = useState(1);
  const rate = rates[rateIndex] ?? 1;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => {
      const d = Number.isFinite(audio.duration) ? audio.duration : 0;
      if (d > 0) {
        setDuration((prev) => (Math.abs(prev - d) < 0.001 ? prev : d));
      }
    };
    const onTimeUpdate = () => {
      if (isSeeking) return;
      const t = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      // Some browsers can fire many `timeupdate` events; coalesce updates to avoid rendering storms.
      if (rafRef.current != null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        setCurrentTime((prev) => (Math.abs(prev - t) < 0.01 ? prev : t));
      });
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime((prev) => (prev === 0 ? prev : 0));
      audio.currentTime = 0;
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('durationchange', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);

    return () => {
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('durationchange', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
    };
  }, [isSeeking]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = rate;
  }, [rate]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setIsPlaying(false);
    setCurrentTime(0);
    setIsSeeking(false);
    setSeekValue(0);
  }, [src]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      if (audio.paused) await audio.play();
      else audio.pause();
    } catch {
      // ignore (autoplay restrictions, etc.)
    }
  };

  const percent = duration > 0 ? Math.min(100, Math.max(0, ((isSeeking ? seekValue : currentTime) / duration) * 100)) : 0;

  const sliderStyle: React.CSSProperties = {
    background: `linear-gradient(to right, #5865F2 ${percent}%, rgba(255,255,255,0.15) ${percent}%)`,
  };

  return (
    <div className={clsx('w-full max-w-[420px] rounded-lg bg-[#2B2D31] border border-[#1E1F22] px-3 py-2', className)}>
      <audio ref={audioRef} preload="metadata">
        <source src={src} type={contentType || undefined} />
      </audio>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void togglePlay();
          }}
          className="w-9 h-9 rounded-full bg-[#1E1F22] hover:bg-[#202225] text-white flex items-center justify-center shrink-0"
          aria-label={isPlaying ? 'pause voice message' : 'play voice message'}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          <Icon icon={isPlaying ? 'mdi:pause' : 'mdi:play'} width="20" height="20" />
        </button>

        <div className="flex-1 min-w-0">
          <input
            type="range"
            min={0}
            max={duration > 0 ? duration : 0}
            step={0.01}
            value={isSeeking ? seekValue : currentTime}
            onMouseDown={(e) => {
              e.stopPropagation();
              setIsSeeking(true);
              setSeekValue(isSeeking ? seekValue : currentTime);
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              setIsSeeking(true);
              setSeekValue(isSeeking ? seekValue : currentTime);
            }}
            onChange={(e) => {
              e.stopPropagation();
              const v = Number.parseFloat(e.target.value);
              if (!Number.isFinite(v)) return;
              setSeekValue(v);
              if (!isSeeking && audioRef.current) {
                audioRef.current.currentTime = v;
                setCurrentTime(v);
              }
            }}
            onMouseUp={(e) => {
              e.stopPropagation();
              const audio = audioRef.current;
              if (audio) {
                audio.currentTime = seekValue;
                setCurrentTime(seekValue);
              }
              setIsSeeking(false);
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
              const audio = audioRef.current;
              if (audio) {
                audio.currentTime = seekValue;
                setCurrentTime(seekValue);
              }
              setIsSeeking(false);
            }}
            className="w-full h-2 rounded-full appearance-none cursor-pointer"
            style={sliderStyle}
            aria-label="voice progress"
          />

          <div className="flex items-center justify-between text-[11px] text-mew-textMuted mt-1 select-none">
            <span>{formatTime(isSeeking ? seekValue : currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setRateIndex((i) => (i + 1) % rates.length);
          }}
          className="px-2 py-1 rounded-md bg-[#1E1F22] hover:bg-[#202225] text-mew-textMuted hover:text-white text-xs font-semibold shrink-0"
          aria-label="change playback speed"
          title="Playback speed"
        >
          {rate}x
        </button>
      </div>
    </div>
  );
};

export default VoiceMessagePlayer;
