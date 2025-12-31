import { Fragment, useEffect, useRef, useState, type MouseEvent, type TouchEvent, type WheelEvent } from 'react';
import { Icon } from '@iconify/react';

interface ImageViewerProps {
  src: string;
  rotation: number;
  setRotation: (r: number | ((prev: number) => number)) => void;
  onEdit: () => void;
  attachmentUrl: string;
  onPrev?: () => void;
  onNext?: () => void;
  onClose: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export const AttachmentImageViewer = ({ src, rotation, setRotation, onEdit, attachmentUrl, onPrev, onNext, onClose }: ImageViewerProps) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressNextClickRef = useRef(false);
  const minSwipeDistance = 50;

  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const [isAltPressed, setIsAltPressed] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === 'Alt') setIsAltPressed(true);
      if (e.code === 'Space') {
        e.preventDefault();
        setIsSpacePressed(true);
      }
      if (e.key === 'ArrowLeft' && onPrev) {
        e.preventDefault();
        e.stopPropagation();
        onPrev();
      }
      if (e.key === 'ArrowRight' && onNext) {
        e.preventDefault();
        e.stopPropagation();
        onNext();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === 'Alt') setIsAltPressed(false);
      if (e.code === 'Space') setIsSpacePressed(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      setContainerSize({ width: container.clientWidth, height: container.clientHeight });
    });

    resizeObserver.observe(container);
    setContainerSize({ width: container.clientWidth, height: container.clientHeight });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      resizeObserver.disconnect();
    };
  }, [onNext, onPrev]);

  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setIsDragging(false);
    setDragStart({ x: 0, y: 0 });
  }, [src]);

  let fitScale = 1;
  if (naturalSize.width > 0 && containerSize.width > 0) {
    fitScale = Math.min(containerSize.width / naturalSize.width, containerSize.height / naturalSize.height);
  }

  const oneToOneScale = fitScale > 0 ? 1 / fitScale : 1;

  const handleWheel = (e: WheelEvent) => {
    if (e.deltaY < 0) setScale(s => Math.min(s + 0.2, 5));
    else setScale(s => Math.max(s - 0.2, 0.5));
  };

  const handleMouseDown = (e: MouseEvent) => {
    if (!isSpacePressed) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    e.stopPropagation();
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    if (isSpacePressed) return;
    if (isAltPressed) setScale(s => Math.max(s / 1.5, 0.5));
    else setScale(s => Math.min(s * 1.5, 5));
  };

  const resetView = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
  };

  const rotateCW = () => setRotation(r => r + 90);

  const cursorStyle = isSpacePressed ? (isDragging ? 'grabbing' : 'grab') : (isAltPressed ? 'zoom-out' : 'zoom-in');

  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) {
      touchStartRef.current = null;
      return;
    }
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    suppressNextClickRef.current = false;
  };

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    if (!start) return;
    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;

    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) suppressNextClickRef.current = true;

    if (scale === 1 && Math.abs(dx) > Math.abs(dy)) {
      e.preventDefault();
    }
  };

  const handleTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    if (!start) return;

    const touch = e.changedTouches[0];
    if (!touch) {
      touchStartRef.current = null;
      return;
    }

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;

    const isHorizontalSwipe = Math.abs(dx) > Math.abs(dy) * 1.25;

    if (scale === 1 && isHorizontalSwipe) {
      if (dx <= -minSwipeDistance && onNext) onNext();
      else if (dx >= minSwipeDistance && onPrev) onPrev();
    }

    touchStartRef.current = null;
  };

  const handleTouchCancel = () => {
    touchStartRef.current = null;
    suppressNextClickRef.current = false;
  };

  return (
    <Fragment>
      <div
        className="w-full h-full flex items-center justify-center overflow-hidden"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        onClick={(e) => {
          e.stopPropagation();
          if (suppressNextClickRef.current) {
            suppressNextClickRef.current = false;
            return;
          }
          onClose();
        }}
        style={{ cursor: cursorStyle }}
        ref={containerRef}
      >
        {onPrev && (
          <button
            type="button"
            aria-label="Previous image"
            className="absolute left-4 top-1/2 -translate-y-1/2 z-[1] h-11 w-11 rounded-full bg-black/40 hover:bg-black/60 text-white/80 hover:text-white flex items-center justify-center backdrop-blur-sm border border-white/10 transition-colors pointer-events-auto"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onPrev();
            }}
          >
            <Icon icon="mdi:chevron-left" width="26" />
          </button>
        )}

        {onNext && (
          <button
            type="button"
            aria-label="Next image"
            className="absolute right-4 top-1/2 -translate-y-1/2 z-[1] h-11 w-11 rounded-full bg-black/40 hover:bg-black/60 text-white/80 hover:text-white flex items-center justify-center backdrop-blur-sm border border-white/10 transition-colors pointer-events-auto"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onNext();
            }}
          >
            <Icon icon="mdi:chevron-right" width="26" />
          </button>
        )}

        <img
          ref={imageRef}
          src={src}
          alt="Preview"
          onClick={handleClick}
          onLoad={(e) => {
            const img = e.currentTarget;
            setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
          }}
          style={{
            transform: `translate(${position.x}px, ${position.y}px) rotate(${rotation}deg) scale(${scale})`,
            transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
            cursor: cursorStyle,
          }}
          className="max-w-full max-h-full object-contain select-none"
          draggable={false}
        />
      </div>

      <div className="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-none">
        <div
          className="bg-[#1E1F22] rounded-full px-4 py-2 flex items-center gap-4 shadow-2xl border border-[#2B2D31] animate-fade-in-up pointer-events-auto"
          onClick={e => e.stopPropagation()}
        >
          <button onClick={() => window.open(attachmentUrl, '_blank')} className="text-mew-textMuted hover:text-white tooltip" title="Open Original">
            <Icon icon="mdi:open-in-new" width="20" />
          </button>
          <div className="w-[1px] h-6 bg-[#3F4147]"></div>

          <button onClick={resetView} className="text-mew-textMuted hover:text-white" title="Fit to Screen">
            <Icon icon="mdi:fit-to-screen-outline" width="20" />
          </button>
          <button onClick={() => { setScale(oneToOneScale); setPosition({ x: 0, y: 0 }); }} className="text-mew-textMuted hover:text-white font-bold text-xs w-6" title="1:1 Scale">
            1:1
          </button>
          <div className="w-[1px] h-6 bg-[#3F4147]"></div>

          <button onClick={rotateCW} className="text-mew-textMuted hover:text-white" title="Rotate 90°">
            <Icon icon="mdi:rotate-right" width="20" />
          </button>
          <button onClick={onEdit} className="text-mew-textMuted hover:text-white" title="Edit / Draw">
            <Icon icon="mdi:pencil" width="20" />
          </button>

          <div className="w-[1px] h-6 bg-[#3F4147]"></div>
          <button onClick={onClose} className="text-red-400 hover:text-red-500">
            <Icon icon="mdi:close" width="20" />
          </button>
        </div>
      </div>

      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/50 text-xs pointer-events-none bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm animate-fade-in">
        Hold Space to pan • Click to zoom • Alt+Click to zoom out
      </div>
    </Fragment>
  );
};

