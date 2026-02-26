import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import { useModalStore, useNotificationSettingsStore } from '../../../shared/stores';
import { channelApi } from '../../../shared/services/api';
import type { Channel, ChannelNotificationLevel } from '../../../shared/types';
import { useI18n } from '../../../shared/i18n';

export const ChannelNotificationSettingsModal = () => {
  const { t } = useI18n();
  const { closeModal, modalData } = useModalStore();
  const setChannelLevel = useNotificationSettingsStore((s) => s.setChannelLevel);

  const channel: Channel | undefined = modalData?.channel;
  const channelId: string | null = channel?._id || null;

  const [selected, setSelected] = useState<ChannelNotificationLevel>('DEFAULT');
  const options: Array<{ level: ChannelNotificationLevel; title: string; desc: string }> = [
    { level: 'DEFAULT', title: t('notification.option.default'), desc: t('notification.option.defaultDesc') },
    { level: 'ALL_MESSAGES', title: t('notification.option.allMessages'), desc: t('notification.option.allMessagesDesc') },
    { level: 'MENTIONS_ONLY', title: t('notification.option.mentionsOnly'), desc: t('notification.option.mentionsOnlyDesc') },
    { level: 'MUTE', title: t('notification.option.mute'), desc: t('notification.option.muteChannelDesc') },
  ];

  const { data, isLoading } = useQuery({
    queryKey: ['channelNotificationSettings', channelId],
    queryFn: () => channelApi.getMyNotificationSettings(channelId!).then((r) => r.data as { level: ChannelNotificationLevel }),
    enabled: !!channelId,
  });

  useEffect(() => {
    if (data?.level) {
      setSelected(data.level);
      if (channelId) setChannelLevel(channelId, data.level);
    }
  }, [data, channelId, setChannelLevel]);

  const saveMutation = useMutation({
    mutationFn: async (level: ChannelNotificationLevel) => {
      if (!channelId) throw new Error('No channelId');
      const res = await channelApi.updateMyNotificationSettings(channelId, { level });
      return res.data as { level: ChannelNotificationLevel };
    },
    onSuccess: (res) => {
      if (channelId) setChannelLevel(channelId, res.level);
      toast.success(t('notification.settings.updated'));
      closeModal();
    },
    onError: () => toast.error(t('notification.settings.updateFailed')),
  });

  const title = useMemo(() => {
    if (!channel) return t('notification.channel.fallback');
    if (channel.type === 'DM') return t('notification.channel.dm');
    return `#${channel.name || t('notification.channel.unnamed')}`;
  }, [channel, t]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <div className="bg-[#313338] w-full max-w-lg rounded-[4px] shadow-lg overflow-hidden animate-scale-in">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E1F22]">
          <div className="min-w-0">
            <div className="text-xs font-bold text-mew-textMuted uppercase">{t('notification.settings.title')}</div>
            <div className="text-white font-semibold truncate">{title}</div>
          </div>
          <button onClick={closeModal} className="p-2 text-mew-textMuted hover:text-white">
            <Icon icon="mdi:close" width="20" />
          </button>
        </div>

        <div className="p-4">
          <div className="text-xs font-bold text-mew-textMuted uppercase mb-2">{t('notification.level.channel')}</div>

          <div className="space-y-2">
            {options.map((o) => (
              <button
                key={o.level}
                disabled={isLoading}
                onClick={() => setSelected(o.level)}
                className={clsx(
                  'w-full text-left rounded-[4px] border px-3 py-2 transition-colors',
                  selected === o.level ? 'bg-[#3C3D43] border-[#5865F2]' : 'bg-[#2B2D31] border-[#1E1F22] hover:bg-[#35373C]'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="text-white font-medium text-sm">{o.title}</div>
                  <div className={clsx('w-4 h-4 rounded-full border flex items-center justify-center', selected === o.level ? 'border-[#5865F2]' : 'border-[#80848E]')}>
                    {selected === o.level && <div className="w-2 h-2 rounded-full bg-[#5865F2]" />}
                  </div>
                </div>
                <div className="text-sm text-mew-textMuted mt-0.5">{o.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[#1E1F22] bg-[#2B2D31]">
          <button
            onClick={closeModal}
            className="px-4 py-2 rounded text-white text-sm font-medium hover:underline"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={() => saveMutation.mutate(selected)}
            disabled={saveMutation.isPending || isLoading}
            className={clsx(
              'px-4 py-2 rounded text-white text-sm font-medium',
              saveMutation.isPending || isLoading ? 'bg-[#404249] cursor-not-allowed' : 'bg-mew-accent hover:bg-mew-accentHover'
            )}
          >
            {saveMutation.isPending ? t('common.saving') : t('common.saveChanges')}
          </button>
        </div>
      </div>
    </div>
  );
};

