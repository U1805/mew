import { useMemo } from 'react';
import { Icon } from '@iconify/react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { useI18n } from '../../../shared/i18n';

const PRESET_EMOJIS = [
  '👍',
  '👎',
  '❤️',
  '🔥',
  '😂',
  '😮',
  '😢',
  '😡',
  '🎉',
  '👀',
  '🚀',
  '💯',
  '🤔',
  '💀',
  '🤡',
  '✅',
  '❌',
  '👋',
  '🙏',
  '✨',
];

interface MessageContextMenuProps {
  canAddReaction: boolean;
  canReply: boolean;
  canForward: boolean;
  canCopy: boolean;
  canDelete: boolean;
  canSendToJpdict: boolean;
  canTranscribeVoice: boolean;
  isRetracted: boolean;
  onAddReaction: (emoji: string) => void;
  onReply: () => void;
  onForward: () => void;
  onCopy: () => void;
  onAddApp: () => void;
  onSpeak: () => void;
  onSendToJpdict: () => void;
  onTranscribeVoice: () => void;
  onDelete: () => void;
}

export const MessageContextMenu = ({
  canAddReaction,
  canReply,
  canForward,
  canCopy,
  canDelete,
  canSendToJpdict,
  canTranscribeVoice,
  isRetracted,
  onAddReaction,
  onReply,
  onForward,
  onCopy,
  onAddApp,
  onSpeak,
  onSendToJpdict,
  onTranscribeVoice,
  onDelete,
}: MessageContextMenuProps) => {
  const { t } = useI18n();
  const disabled = isRetracted;

  const itemClass = useMemo(
    () =>
      'flex items-center justify-between px-2 py-1.5 hover:bg-[#35373C] text-[#B5BAC1] hover:text-white rounded cursor-pointer text-sm font-medium outline-none select-none',
    []
  );

  const dangerItemClass = useMemo(
    () =>
      'flex items-center justify-between px-2 py-1.5 hover:bg-red-500 hover:text-white text-red-400 rounded cursor-pointer text-sm font-medium outline-none select-none',
    []
  );

  return (
    <ContextMenu.Portal>
      <ContextMenu.Content className="min-w-[210px] bg-[#2b2d31] rounded p-1.5 shadow-xl z-[9999] animate-fade-in border border-white/5">
        {canAddReaction && (
          <ContextMenu.Sub>
            <ContextMenu.SubTrigger className={itemClass} disabled={disabled}>
              <span className="flex items-center gap-2">
                <Icon icon="mdi:emoticon-plus-outline" width="18" />
                {t('message.menu.addReaction')}
              </span>
              <Icon icon="mdi:chevron-right" width="16" />
            </ContextMenu.SubTrigger>
            <ContextMenu.Portal>
              <ContextMenu.SubContent className="min-w-[190px] bg-[#2b2d31] rounded p-2 shadow-xl z-[9999] border border-white/5 ml-1">
                <div className="grid grid-cols-5 gap-1">
                  {PRESET_EMOJIS.map((emoji) => (
                    <ContextMenu.Item
                      key={emoji}
                      asChild
                      onSelect={(e) => {
                        onAddReaction(emoji);
                      }}
                    >
                      <button
                        type="button"
                        className="w-8 h-8 flex items-center justify-center hover:bg-[#35373C] rounded transition-colors text-lg"
                        disabled={disabled}
                      >
                        {emoji}
                      </button>
                    </ContextMenu.Item>
                  ))}
                </div>
              </ContextMenu.SubContent>
            </ContextMenu.Portal>
          </ContextMenu.Sub>
        )}

        <ContextMenu.Separator className="h-[1px] bg-white/5 my-1" />

        <ContextMenu.Item
          className={itemClass}
          disabled={disabled || !canReply}
          onSelect={(e) => {
            onReply();
          }}
        >
          <span className="flex items-center gap-2">
            <Icon icon="mdi:reply" width="18" />
            {t('message.menu.reply')}
          </span>
        </ContextMenu.Item>

        <ContextMenu.Item
          className={itemClass}
          disabled={disabled || !canForward}
          onSelect={(e) => {
            onForward();
          }}
        >
          <span className="flex items-center gap-2">
            <Icon icon="mdi:reply" width="18" style={{ transform: 'scaleX(-1)' }} />
            {t('message.menu.forward')}
          </span>
        </ContextMenu.Item>

        <ContextMenu.Separator className="h-[1px] bg-white/5 my-1" />

        <ContextMenu.Item
          className={itemClass}
          disabled={disabled || !canCopy}
          onSelect={(e) => {
            onCopy();
          }}
        >
          <span className="flex items-center gap-2">
            <Icon icon="mdi:content-copy" width="18" />
            {t('message.menu.copyMessage')}
          </span>
        </ContextMenu.Item>

        <ContextMenu.Sub>
          <ContextMenu.SubTrigger className={itemClass} disabled={disabled}>
            <span className="flex items-center gap-2">
              <Icon icon="mdi:puzzle-outline" width="18" />
              {t('message.menu.app')}
            </span>
            <Icon icon="mdi:chevron-right" width="16" />
          </ContextMenu.SubTrigger>
          <ContextMenu.Portal>
            <ContextMenu.SubContent className="min-w-[210px] bg-[#2b2d31] rounded p-1.5 shadow-xl z-[9999] border border-white/5 ml-1">
              {canTranscribeVoice && (
                <ContextMenu.Item
                  className={itemClass}
                  disabled={disabled}
                  onSelect={() => {
                    onTranscribeVoice();
                  }}
                >
                  <span className="flex items-center gap-2">
                    <Icon icon="mdi:text-recognition" width="18" />
                    {t('message.menu.transcribe')}
                  </span>
                </ContextMenu.Item>
              )}

              {canSendToJpdict ? (
                <ContextMenu.Item
                  className={itemClass}
                  disabled={disabled}
                  onSelect={() => {
                    onSendToJpdict();
                  }}
                >
                  <span className="flex items-center gap-2">
                    <Icon icon="mdi:send" width="18" />
                    {t('message.menu.sendToJpdict')}
                  </span>
                </ContextMenu.Item>
              ): (<></>)}

              <ContextMenu.Item
                className={itemClass}
                disabled={disabled}
                onSelect={() => {
                  onSpeak();
                }}
              >
                <span className="flex items-center gap-2">
                  <Icon icon="mdi:volume-high" width="18" />
                  {t('message.menu.speakText')}
                </span>
              </ContextMenu.Item>
            </ContextMenu.SubContent>
          </ContextMenu.Portal>
        </ContextMenu.Sub>

        {canDelete && (
          <ContextMenu.Item
            className={dangerItemClass}
            disabled={disabled}
            onSelect={(e) => {
              onDelete();
            }}
          >
            <span className="flex items-center gap-2">
              <Icon icon="mdi:trash-can-outline" width="18" />
              {t('message.delete.title')}
            </span>
          </ContextMenu.Item>
        )}
      </ContextMenu.Content>
    </ContextMenu.Portal>
  );
};

export default MessageContextMenu;
