import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import { useI18n } from '../../../shared/i18n';

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const mm = Math.floor(total / 60);
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
};

const generateWaveformData = (seedString: string, bars: number = 36) => {
  let hash = 0;
  for (let i = 0; i < seedString.length; i++) {
    hash = (hash << 5) - hash + seedString.charCodeAt(i);
    hash |= 0;
  }
  const data = [];
  for (let i = 0; i < bars; i++) {
    const val = Math.sin(hash + i) * 10000;
    const normalized = Math.abs(val - Math.floor(val)); 
    data.push(0.3 + normalized * 0.7);
  }
  return data;
};

type Props = {
  src: string;
  contentType?: string;
  durationMs?: number;
  className?: string;
};

export const VoiceMessagePlayer = ({ src, contentType, durationMs, className }: Props) => {
  const { t } = useI18n();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState<number>(durationMs ? durationMs / 1000 : 0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  
  const animationFrameRef = useRef<number | null>(null);
  const waveformHeights = useMemo(() => generateWaveformData(src, 36), [src]);

  // --- 核心修改：主动轮询 Loop ---
  // 只要在播放，就每帧(约16ms)读取一次 currentTime，实现 60fps 流畅度
  useEffect(() => {
    if (isPlaying && !isScrubbing) {
      const loop = () => {
        if (audioRef.current) {
          setCurrentTime(audioRef.current.currentTime);
        }
        animationFrameRef.current = requestAnimationFrame(loop);
      };
      loop(); // 启动循环
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, isScrubbing]);

  // --- Audio 事件监听 ---
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => {
      const d = Number.isFinite(audio.duration) ? audio.duration : 0;
      if (d > 0) setDuration(d);
    };

    // 虽然有了 loop，但 timeupdate 依然保留用于校准
    // 防止 loop 在后台页面被降频导致的时间不同步
    const onTimeUpdate = () => {
      if (!isPlaying && !isScrubbing) {
        setCurrentTime(audio.currentTime);
      }
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('durationchange', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('durationchange', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
    };
  }, [isPlaying, isScrubbing]);

  // 重置
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setIsPlaying(false);
    setCurrentTime(0);
  }, [src]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      if (audio.paused) await audio.play();
      else audio.pause();
    } catch (err) {
      console.error(err);
    }
  };

  const handleScrub = useCallback((clientX: number) => {
    if (!containerRef.current || duration <= 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percentage = x / rect.width;
    const newTime = percentage * duration;
    
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  }, [duration]);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsScrubbing(true);
    handleScrub(e.clientX);
    
    const onPointerMove = (evt: PointerEvent) => handleScrub(evt.clientX);
    const onPointerUp = () => {
      setIsScrubbing(false);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
    
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  const renderBars = (colorClass: string) => (
    <div className="flex items-center gap-[2px] w-full h-full">
        {waveformHeights.map((height, index) => (
            <div
              key={index}
              className={clsx("w-[3px] rounded-full flex-shrink-0", colorClass)}
              style={{ height: `${height * 100}%` }}
            />
        ))}
    </div>
  );

  return (
    <div className={clsx('flex items-center gap-3 px-3 py-2 rounded-lg bg-[#2B2D31] border border-[#1E1F22] w-fit max-w-[320px]', className)}>
      <audio ref={audioRef} preload="metadata" src={src} />

      <button
        type="button"
        onClick={(e) => {
            e.stopPropagation();
            void togglePlay();
        }}
        className={clsx(
            "w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors",
            "text-[#DBDEE1] hover:text-white hover:bg-[#404249]"
        )}
      >
        <Icon icon={isPlaying ? 'mdi:pause' : 'mdi:play'} width="24" height="24" className="ml-0.5" />
      </button>

      <div 
        ref={containerRef}
        className="h-8 relative w-[180px] cursor-pointer select-none touch-none"
        onPointerDown={onPointerDown}
        role="slider"
        aria-valuenow={currentTime}
        aria-valuemin={0}
        aria-valuemax={duration}
        title={t('voice.seek')}
      >
        {/* Layer 1: Background */}
        <div className="absolute inset-0 flex items-center opacity-60">
            {renderBars("bg-[#4E5058]")}
        </div>

        {/* Layer 2: Foreground (Blue) */}
        {/* 注意：移除了所有的 transition 类名 */}
        <div 
            className="absolute inset-y-0 left-0 overflow-hidden flex items-center pointer-events-none will-change-[width]"
            style={{ width: `${progressPercent}%` }}
        >
             <div className="w-[180px] h-full flex items-center">
                {renderBars("bg-[#5865F2]")}
             </div>
        </div>
      </div>

      <div className="text-xs font-mono text-[#949BA4] tabular-nums min-w-[36px] text-right select-none">
        {durationMs && duration === 0 
            ? formatTime(durationMs / 1000) 
            : formatTime(isPlaying || currentTime > 0 ? currentTime : duration)
        }
      </div>
    </div>
  );
};

export default VoiceMessagePlayer;
