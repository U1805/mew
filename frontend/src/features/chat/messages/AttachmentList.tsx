import React, { useState, useEffect, useRef } from 'react';
import { Attachment } from '../../../shared/types';
import { Icon } from '@iconify/react';
import { formatFileSize } from '../../../shared/utils/file';
import { uploadApi, messageApi } from '../../../shared/services/api';
import clsx from 'clsx';
import toast from 'react-hot-toast';

interface AttachmentListProps {
  attachments: Attachment[];
  serverId?: string;
  channelId?: string;
}

export const AttachmentList: React.FC<AttachmentListProps> = ({ attachments, serverId, channelId }) => {
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);

  if (!attachments || attachments.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2 mt-2 max-w-[600px]">
        {attachments.map((attachment, index) => {
          const isImage = attachment.contentType.startsWith('image/');

          if (isImage) {
            return (
              <div 
                key={index} 
                className="relative group overflow-hidden rounded-lg cursor-zoom-in"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewAttachment(attachment);
                }}
              >
                <img 
                  src={attachment.url} 
                  alt={attachment.filename}
                  className="max-h-[350px] max-w-full object-contain rounded-lg border border-[#1E1F22]/50 hover:opacity-90 transition-opacity"
                />
              </div>
            );
          }

          // Generic File Card
          return (
            <div key={index} className="flex items-center p-3 bg-[#2B2D31] border border-[#1E1F22] rounded-[4px] max-w-[300px] w-full group">
              <div className="mr-3 text-mew-textMuted">
                 <Icon icon="mdi:file-document-outline" width="30" height="30" />
              </div>
              <div className="flex-1 min-w-0 mr-2">
                  <div className="text-sm font-medium text-mew-text truncate" title={attachment.filename}>{attachment.filename}</div>
                  <div className="text-xs text-mew-textMuted">{formatFileSize(attachment.size)}</div>
              </div>
              <a 
                  href={attachment.url} 
                  download={attachment.filename} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-mew-textMuted hover:text-white transition-colors"
                  title="Download"
                  onClick={(e) => e.stopPropagation()}
              >
                  <Icon icon="mdi:download" width="24" height="24" />
              </a>
            </div>
          );
        })}
      </div>

      {/* Lightbox Overlay */}
      {previewAttachment && (
        <Lightbox 
            attachment={previewAttachment} 
            onClose={() => setPreviewAttachment(null)}
            serverId={serverId}
            channelId={channelId}
        />
      )}
    </>
  );
};

// --- Lightbox Sub-Components ---

interface LightboxProps {
    attachment: Attachment;
    onClose: () => void;
    serverId?: string;
    channelId?: string;
}

const Lightbox: React.FC<LightboxProps> = ({ attachment, onClose, serverId, channelId }) => {
    const [isEditing, setIsEditing] = useState(false);
    // Shared state: rotation. 
    const [rotation, setRotation] = useState(0);
    
    // Animation states
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Trigger enter animation
        requestAnimationFrame(() => setIsVisible(true));
        
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (isEditing) {
                     // Let ImageEditor handle escape or just ignore
                } else {
                    handleClose();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isEditing]);

    const handleClose = () => {
        setIsVisible(false);
        // Wait for animation to finish before unmounting
        setTimeout(onClose, 300);
    };

    const handleSend = async (blob: Blob) => {
        if (!channelId) {
            toast.error("Cannot send message: Channel ID missing.");
            return;
        }

        const formData = new FormData();
        const filename = `edited_${Date.now()}.png`;
        formData.append('file', blob, filename);

        const loadingToast = toast.loading('Uploading edited image...');

        try {
            // 1. Upload
            const uploadRes = await uploadApi.uploadFile(channelId, formData);
            const key = uploadRes.data.key;

            const finalAttachment = {
                filename,
                contentType: 'image/png',
                key: key,
                size: blob.size,
            } as unknown as Attachment;

            // 2. Send Message
            await messageApi.send(serverId, channelId, {
                content: '',
                attachments: [finalAttachment]
            });

            toast.success('Image sent!', { id: loadingToast });
            handleClose();
        } catch (error) {
            console.error(error);
            toast.error('Failed to send image.', { id: loadingToast });
        }
    };

    return (
        <div 
            className={clsx(
                "fixed inset-0 z-[100] flex flex-col items-center justify-center select-none transition-opacity duration-300 ease-out",
                isVisible ? "opacity-100" : "opacity-0"
            )}
            onClick={(e) => {
                 e.stopPropagation();
                 if (!isEditing) handleClose();
            }}
        >
             {/* Backdrop */}
             <div className="absolute inset-0 bg-black/90 backdrop-blur-sm"></div>

             {/* Main Content Area */}
             <div 
                className={clsx(
                    "flex-1 w-full h-full relative overflow-hidden flex items-center justify-center transition-transform duration-300 ease-out",
                    isVisible ? "scale-100" : "scale-95"
                )}
             >
                {isEditing ? (
                    <ImageEditor 
                        src={attachment.url} 
                        initialRotation={rotation} 
                        onCancel={() => setIsEditing(false)}
                        onSend={handleSend}
                    />
                ) : (
                    <ImageViewer 
                        src={attachment.url} 
                        rotation={rotation}
                        setRotation={setRotation}
                        onEdit={() => setIsEditing(true)}
                        attachmentUrl={attachment.url}
                        onClose={handleClose}
                    />
                )}
             </div>
        </div>
    );
};

// --- Image Viewer (Zoom/Pan/Rotate) ---

interface ImageViewerProps {
    src: string;
    rotation: number;
    setRotation: (r: number | ((prev: number) => number)) => void;
    onEdit: () => void;
    attachmentUrl: string;
    onClose: () => void;
}

const ImageViewer: React.FC<ImageViewerProps> = ({ src, rotation, setRotation, onEdit, attachmentUrl, onClose }) => {
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
        const imageRef = useRef<HTMLImageElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

    const [isAltPressed, setIsAltPressed] = useState(false);
    const [isSpacePressed, setIsSpacePressed] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Alt') setIsAltPressed(true);
            if (e.code === 'Space') {
                e.preventDefault(); // Prevent scrolling
                setIsSpacePressed(true);
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
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

        // Initial size
        setContainerSize({ width: container.clientWidth, height: container.clientHeight });

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            resizeObserver.disconnect();
        };
    }, []);

    let fitScale = 1;
    if (naturalSize.width > 0 && containerSize.width > 0) {
        fitScale = Math.min(
            containerSize.width / naturalSize.width,
            containerSize.height / naturalSize.height
        );
    }

    const oneToOneScale = fitScale > 0 ? 1 / fitScale : 1;

    const handleWheel = (e: React.WheelEvent) => {
        // e.stopPropagation(); 
        if (e.deltaY < 0) {
            setScale(s => Math.min(s + 0.2, 5));
        } else {
            setScale(s => Math.max(s - 0.2, 0.5));
        }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!isSpacePressed) return;
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        e.preventDefault();
        e.stopPropagation();
        setPosition({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        
        if (isSpacePressed) return; // Don't zoom if we are trying to pan

                if (isAltPressed) {
            setScale(s => Math.max(s / 1.5, 0.5));
        } else {
            setScale(s => Math.min(s * 1.5, 5));
        }
    };

    const resetView = () => {
        setScale(1);
        setPosition({ x: 0, y: 0 });
        setRotation(0);
    };

    const rotateCW = () => {
        // Don't mod 360 to ensure animation direction is always clockwise
        setRotation(r => r + 90);
    };

    // Determine cursor style
    let cursorStyle = 'default';
    if (isSpacePressed) {
        cursorStyle = isDragging ? 'grabbing' : 'grab';
    } else {
        cursorStyle = isAltPressed ? 'zoom-out' : 'zoom-in';
    }

    return (
        <>
            <div 
                className="w-full h-full flex items-center justify-center overflow-hidden"
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onClick={(e) => { e.stopPropagation(); onClose(); }} // Clicking background closes
                style={{ cursor: cursorStyle }}
                ref={containerRef}
            >
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
                        cursor: cursorStyle
                    }}
                    className="max-w-full max-h-full object-contain select-none"
                    draggable={false}
                 />
            </div>

            {/* Toolbar */}
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

            {/* Helper Text */}
             <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/50 text-xs pointer-events-none bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm animate-fade-in">
                Hold Space to pan • Click to zoom • Alt+Click to zoom out
            </div>
        </>
    );
}

// --- Image Editor (Canvas) ---

interface ImageEditorProps {
    src: string;
    initialRotation: number;
    onCancel: () => void;
    onSend: (blob: Blob) => void;
}

const ImageEditor: React.FC<ImageEditorProps> = ({ src, initialRotation, onCancel, onSend }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [context, setContext] = useState<CanvasRenderingContext2D | null>(null);
    const lastPos = useRef<{x: number, y: number} | null>(null);

    // Initialize Canvas
    useEffect(() => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.src = src;
        image.onload = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;

            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // Determine dimensions based on rotation
            // Normalize rotation to 0-360 for calculation
            const normRotation = ((initialRotation % 360) + 360) % 360;
            const isRotated90or270 = normRotation === 90 || normRotation === 270;
            
            canvas.width = isRotated90or270 ? image.naturalHeight : image.naturalWidth;
            canvas.height = isRotated90or270 ? image.naturalWidth : image.naturalHeight;

            // Clear and prepare transformation
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.save();
            
            // Move origin to center
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate((initialRotation * Math.PI) / 180);
            
            // Draw image centered
            ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
            
            ctx.restore();

            // Prepare for drawing
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = '#EF4444'; // Tailwind Red-500
            ctx.lineWidth = 5;
            
            setContext(ctx);
        };
    }, [src, initialRotation]);

    const getPos = (e: React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        
        // Map client coordinates to canvas internal coordinates
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    };

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        e.stopPropagation();
        e.preventDefault(); // Prevent scrolling on touch
        setIsDrawing(true);
        const pos = getPos(e);
        lastPos.current = pos;
        
        // Draw a dot if just clicking
        if (context) {
            context.beginPath();
            context.moveTo(pos.x, pos.y);
            context.lineTo(pos.x, pos.y);
            context.stroke();
        }
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
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
            if (blob) {
                onSend(blob);
            } else {
                toast.error("Failed to generate image data.");
            }
        }, 'image/png');
    };

    return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-[#1E1F22]" onClick={(e) => e.stopPropagation()}>
            {/* Header / Info Bar */}
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
                        className="max-w-full max-h-[80vh] cursor-crosshair bg-[url('https://t3.ftcdn.net/jpg/05/11/25/36/360_F_511253627_zuzpapnIVCA8s5z4Q4h9Yc7a8N3P363f.jpg')] bg-repeat" // Checkerboard for transparency hint
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
            
            {/* Editor Bottom Toolbar */}
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
}