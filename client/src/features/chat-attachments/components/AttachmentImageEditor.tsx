import { useEffect, useRef, useState, type MouseEvent, type TouchEvent } from 'react';
import { Icon } from '@iconify/react';
import toast from 'react-hot-toast';

interface ImageEditorProps {
  src: string;
  initialRotation: number;
  onCancel: () => void;
  onSend: (blob: Blob) => void;
}

export const AttachmentImageEditor = ({ src, initialRotation, onCancel, onSend }: ImageEditorProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [context, setContext] = useState<CanvasRenderingContext2D | null>(null);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = src;
    image.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const normRotation = ((initialRotation % 360) + 360) % 360;
      const isRotated90or270 = normRotation === 90 || normRotation === 270;

      canvas.width = isRotated90or270 ? image.naturalHeight : image.naturalWidth;
      canvas.height = isRotated90or270 ? image.naturalWidth : image.naturalHeight;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((initialRotation * Math.PI) / 180);
      ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
      ctx.restore();

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 5;

      setContext(ctx);
    };
  }, [src, initialRotation]);

  const getPos = (e: MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const startDrawing = (e: MouseEvent | TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDrawing(true);
    const pos = getPos(e);
    lastPos.current = pos;

    if (context) {
      context.beginPath();
      context.moveTo(pos.x, pos.y);
      context.lineTo(pos.x, pos.y);
      context.stroke();
    }
  };

  const draw = (e: MouseEvent | TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!isDrawing || !context || !lastPos.current) return;

    const newPos = getPos(e);
    context.beginPath();
    context.moveTo(lastPos.current.x, lastPos.current.y);
    context.lineTo(newPos.x, newPos.y);
    context.stroke();
    lastPos.current = newPos;
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    lastPos.current = null;
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `mew_edit_${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  };

  const handleSendAction = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (blob) onSend(blob);
      else toast.error("Failed to generate image data.");
    }, 'image/png');
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#1E1F22]" onClick={(e) => e.stopPropagation()}>
      <div className="h-14 w-full bg-[#111214] flex items-center justify-between px-6 border-b border-white/5 shrink-0 animate-fade-in-up z-10 shadow-md">
        <div className="flex items-center gap-2">
          <Icon icon="mdi:pencil" className="text-mew-accent" width="20" />
          <span className="font-bold text-white text-sm">Editor Mode</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 mr-4 bg-[#1E1F22] px-3 py-1 rounded-full border border-white/5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"></div>
            <span className="text-xs text-mew-textMuted font-medium">Freehand</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden w-full flex items-center justify-center p-8 bg-[#18191C]">
        <div className="relative shadow-2xl border border-[#2B2D31]">
          <canvas
            ref={canvasRef}
            className="max-w-full max-h-[80vh] cursor-crosshair bg-[url('https://t3.ftcdn.net/jpg/05/11/25/36/360_F_511253627_zuzpapnIVCA8s5z4Q4h9Yc7a8N3P363f.jpg')] bg-repeat"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
        </div>
      </div>

      <div className="h-20 w-full bg-[#111214] flex items-center justify-between px-8 border-t border-white/5 shrink-0 animate-fade-in-up z-10 shadow-[0_-5px_20px_rgba(0,0,0,0.3)]">
        <button
          onClick={onCancel}
          className="text-mew-textMuted hover:text-white text-sm font-medium px-4 py-2 rounded hover:bg-white/5 transition-colors"
        >
          Cancel
        </button>

        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            className="bg-[#2B2D31] hover:bg-[#35373C] text-white px-5 py-2.5 rounded shadow-lg border border-white/5 text-sm font-semibold transition-all flex items-center gap-2"
          >
            <Icon icon="mdi:download" />
            Save to Device
          </button>
          <button
            onClick={handleSendAction}
            className="bg-mew-accent hover:bg-mew-accentHover text-white px-6 py-2.5 rounded shadow-lg shadow-mew-accent/20 text-sm font-semibold transition-all flex items-center gap-2 transform active:scale-95"
          >
            <Icon icon="mdi:send" />
            Send to Channel
          </button>
        </div>
      </div>
    </div>
  );
};

