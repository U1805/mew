import type { RefObject } from 'react';
import { Icon } from '@iconify/react';
import clsx from 'clsx';

import type { Sticker } from '../../../shared/types';
import { useI18n } from '../../../shared/i18n';

export const ServerSettingsStickersTab: React.FC<{
  canManageStickers: boolean;
  stickerInputRef: RefObject<HTMLInputElement>;
  newStickerPreview: string | null;
  newStickerName: string;
  setNewStickerName: (next: string) => void;
  newStickerFile: File | null;
  onStickerSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUpload: () => void;
  isUploading: boolean;

  stickers: Sticker[] | undefined;
  isLoadingStickers: boolean;
  stickerDrafts: Record<string, { name: string; description: string }>;
  setStickerDrafts: React.Dispatch<React.SetStateAction<Record<string, { name: string; description: string }>>>;
  onUpdateSticker: (input: { stickerId: string; name: string; description: string }) => void;
  isUpdatingSticker: boolean;
  onRequestDeleteSticker: (sticker: Sticker) => void;
  isDeletingSticker: boolean;
}> = ({
  canManageStickers,
  stickerInputRef,
  newStickerPreview,
  newStickerName,
  setNewStickerName,
  newStickerFile,
  onStickerSelect,
  onUpload,
  isUploading,
  stickers,
  isLoadingStickers,
  stickerDrafts,
  setStickerDrafts,
  onUpdateSticker,
  isUpdatingSticker,
  onRequestDeleteSticker,
  isDeletingSticker,
}) => {
  const { t } = useI18n();
  return (
    <div className="h-full flex flex-col p-4 md:p-0 overflow-hidden">
      <div className="pb-4 border-b border-[#3F4147] shrink-0">
        <h2 className="text-xl font-bold text-white mb-2">{t('settings.stickers')}</h2>
        <p className="text-sm text-mew-textMuted">{t('sticker.serverSubtitle')}</p>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar py-6 space-y-8">
        <div>
          {!canManageStickers && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-200 text-sm p-3 rounded mb-4">
              {t('sticker.noPermission')}
            </div>
          )}

          <div className="flex gap-4 items-start">
            <div
              onClick={() => canManageStickers && stickerInputRef.current?.click()}
              className={clsx(
                'w-24 h-24 rounded-lg border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors shrink-0',
                canManageStickers
                  ? 'border-[#4E5058] hover:border-mew-textMuted bg-[#1E1F22] hover:bg-[#232428]'
                  : 'border-[#2F3136] bg-[#202225] opacity-50 cursor-not-allowed'
              )}
            >
              <input
                type="file"
                ref={stickerInputRef}
                className="hidden"
                accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                onChange={onStickerSelect}
                disabled={!canManageStickers}
              />
              {newStickerPreview ? (
                <img src={newStickerPreview} className="w-full h-full object-contain p-1" />
              ) : (
                <>
                  <Icon icon="mdi:plus" className="text-mew-textMuted mb-1" width="24" />
                  <span className="text-[10px] font-bold text-mew-textMuted uppercase">{t('server.create.upload')}</span>
                </>
              )}
            </div>

            <div className="flex-1 space-y-3">
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="text-xs font-bold text-mew-textMuted uppercase mb-1 block">{t('sticker.name')}</label>
                  <input
                    value={newStickerName}
                    onChange={(e) => setNewStickerName(e.target.value)}
                    className="w-full bg-[#1E1F22] text-white p-2 rounded text-sm outline-none focus:ring-1 focus:ring-mew-accent transition-all"
                    placeholder={t('sticker.namePlaceholder')}
                    disabled={!canManageStickers}
                  />
                </div>
              </div>

              {newStickerFile && (
                <div className="flex gap-2">
                  <button
                    onClick={onUpload}
                    disabled={isUploading || !newStickerName.trim()}
                    className={clsx(
                      'bg-mew-accent hover:bg-mew-accentHover text-white px-4 py-2 rounded text-sm font-medium transition-colors',
                      (isUploading || !newStickerName.trim()) && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {isUploading ? t('sticker.uploading') : t('sticker.upload')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white">{t('sticker.count', { count: stickers?.length || 0 })}</h3>
          </div>

          {isLoadingStickers ? (
            <div className="text-mew-textMuted text-sm">{t('sticker.loading')}</div>
          ) : !stickers?.length ? (
            <div className="bg-[#1E1F22] rounded-lg p-6 text-center">
              <Icon icon="mdi:sticker-emoji" width="44" className="text-mew-textMuted opacity-40 mx-auto mb-3" />
              <p className="text-mew-textMuted text-sm">{t('sticker.none')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {stickers.map((s) => {
                const draft = stickerDrafts[s._id] || { name: s.name || '', description: s.description || '' };
                return (
                  <div key={s._id} className="bg-[#1E1F22] rounded-lg p-3 flex items-center gap-3 group">
                    <div className="w-12 h-12 rounded bg-[#2B2D31] flex items-center justify-center overflow-hidden shrink-0">
                      <img src={s.url} alt={s.name} className="w-full h-full object-contain" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div>
                        <input
                          value={draft.name}
                          onChange={(e) => setStickerDrafts((prev) => ({ ...prev, [s._id]: { ...draft, name: e.target.value } }))}
                          className="bg-transparent text-white font-medium text-sm w-full outline-none border-b border-transparent focus:border-mew-accent transition-colors placeholder-mew-textMuted/50"
                          placeholder={t('sticker.name')}
                          disabled={!canManageStickers}
                        />
                      </div>
                      <div>
                        <input
                          value={draft.description}
                          onChange={(e) => setStickerDrafts((prev) => ({ ...prev, [s._id]: { ...draft, description: e.target.value } }))}
                          className="bg-transparent text-mew-textMuted text-sm w-full outline-none border-b border-transparent focus:border-mew-accent transition-colors placeholder-mew-textMuted/50"
                          placeholder={t('sticker.descriptionOptional')}
                          disabled={!canManageStickers}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => onUpdateSticker({ stickerId: s._id, ...draft })}
                        disabled={isUpdatingSticker}
                        className="p-1.5 text-mew-textMuted hover:text-green-400 hover:bg-[#202225] rounded transition-colors"
                        title={t('common.saveChanges')}
                      >
                        <Icon icon="mdi:check" width="20" />
                      </button>
                      <button
                        onClick={() => onRequestDeleteSticker(s)}
                        disabled={isDeletingSticker}
                        className="p-1.5 text-mew-textMuted hover:text-red-400 hover:bg-[#202225] rounded transition-colors"
                        title={t('sticker.delete')}
                      >
                        <Icon icon="mdi:trash-can-outline" width="20" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
