import React, { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@iconify/react';
import { useModalStore } from '../../../shared/stores';
import { serverApi } from '../../../shared/services/api';
import toast from 'react-hot-toast';
import { useI18n } from '../../../shared/i18n';

export const CreateServerModal: React.FC = () => {
  const { t } = useI18n();
  const { closeModal, openModal } = useModalStore();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.size > 50 * 1024 * 1024) {
          toast.error(t('toast.imageSizeLimit'));
          return;
      }

      setIconFile(file);
      setIconPreview(URL.createObjectURL(file));
      e.target.value = ''; // Reset input
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);
    try {
      const res = await serverApi.create({ name });
      const serverId = res.data._id;
      
      if (iconFile) {
          try {
              const formData = new FormData();
              formData.append('icon', iconFile);
              await serverApi.uploadIcon(serverId, formData);
          } catch (uploadError) {
              console.error("Failed to upload icon:", uploadError);
              toast.error(t('server.create.iconUploadFailed'));
          }
      }

      await queryClient.invalidateQueries({ queryKey: ['servers'] });
      closeModal();
  } catch (error) {
      console.error("Failed to create server:", error);
      toast.error(t('server.create.failed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <div className="bg-[#313338] w-full max-w-md rounded-[4px] shadow-lg flex flex-col overflow-hidden animate-scale-in">
        <div className="p-4 pt-5 pb-3 text-center">
          <h2 className="text-2xl font-bold text-white mb-2">{t('server.create.title')}</h2>
          <p className="text-mew-textMuted text-sm leading-5 px-4">{t('server.create.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="px-4">
          <div className="flex justify-center mb-6">
              <div 
                  className="w-[80px] h-[80px] rounded-full bg-[#1E1F22] border-dashed border-2 border-[#4E5058] flex flex-col items-center justify-center cursor-pointer hover:border-mew-textMuted transition-colors relative overflow-hidden group"
                  onClick={() => fileInputRef.current?.click()}
              >
                  <input 
                      type="file" 
                      ref={fileInputRef} 
                      className="hidden" 
                      accept="image/png, image/jpeg, image/gif"
                      onChange={handleFileChange}
                  />

                  {iconPreview ? (
                      <>
                          <img src={iconPreview} alt={t('modal.preview')} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <span className="text-[10px] font-bold text-white uppercase">{t('account.change')}</span>
                          </div>
                      </>
                  ) : (
                      <>
                          <Icon icon="mdi:camera-plus" className="text-mew-textMuted group-hover:text-white mb-1 transition-colors" width="24" />
                          <span className="text-[10px] font-bold text-mew-textMuted group-hover:text-white uppercase transition-colors">{t('server.create.upload')}</span>
                      </>
                  )}
              </div>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">{t('server.create.serverName')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#1E1F22] text-white p-2.5 rounded border-none focus:outline-none focus:ring-0 font-medium"
              placeholder={t('server.create.enterName')}
              autoFocus
            />
          </div>
          <div className="mb-2 text-center">
            <button
              type="button"
              className="text-mew-textMuted hover:text-white text-xs font-medium bg-[#2B2D31] px-4 py-2 rounded border border-[#1E1F22] hover:border-mew-textMuted transition-all w-full"
              onClick={() => { closeModal(); openModal('joinServer'); }}
            >
              {t('server.create.haveInvite')}
            </button>
          </div>
        </form>

        <div className="bg-[#2B2D31] p-4 flex justify-between items-center mt-2">
          <button type="button" onClick={closeModal} className="text-white hover:underline text-sm font-medium px-4">
            {t('server.create.back')}
          </button>
          <button onClick={handleSubmit} disabled={isLoading || !name.trim()} className="px-6 py-2 rounded-[3px] font-medium text-sm transition-colors text-white bg-mew-accent hover:bg-mew-accentHover disabled:opacity-50 disabled:cursor-not-allowed">
            {t('server.create.create')}
          </button>
        </div>
      </div>
    </div>
  );
};
