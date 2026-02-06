import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@iconify/react';
import { useModalStore, useUIStore } from '../../../shared/stores';
import { useAuthStore } from '../../../shared/stores/authStore';
import { ConfirmModal } from '../../../shared/components/ConfirmModal';
import { messageApi } from '../../../shared/services/api';
import { Channel, ChannelType, Message } from '../../../shared/types';
import { useDmChannels } from '../../channel/hooks/useDmChannels';
import { useServersWithChannels } from '../../server/hooks/useServersWithChannels';
import { useI18n } from '../../../shared/i18n';

type ForwardTarget = {
  channelId: string;
  serverId?: string;
  label: string;
};

export const ForwardMessageModal: React.FC = () => {
  const { closeModal, modalData } = useModalStore();
  const { currentServerId, currentChannelId } = useUIStore();
  const { user } = useAuthStore();
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const message: Message | undefined = modalData?.message;
  const [target, setTarget] = useState<ForwardTarget | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { data: dmChannels = [] } = useDmChannels();
  const { servers = [], channelQueries = [] } = useServersWithChannels();

  const sourceLabel = useMemo(() => {
    if (!currentChannelId) return '';

    if (currentServerId) {
      const channels = queryClient.getQueryData<Channel[]>(['channels', currentServerId]) || [];
      const channel = channels.find((c) => c._id === currentChannelId);
      return channel?.name ? `#${channel.name}` : t('forward.channelFallback');
    }

    const channel = (queryClient.getQueryData<Channel[]>(['dmChannels']) || []).find((c) => c._id === currentChannelId);
    const otherUser = channel?.recipients?.find((r) => typeof r === 'object' && r._id !== user?._id) as any;
    return otherUser?.username ? `@${otherUser.username}` : t('forward.dmFallback');
  }, [currentChannelId, currentServerId, queryClient, t, user?._id]);

  const targets = useMemo(() => {
    const results: {
      serverGroups: Array<{ serverId: string; serverName: string; channels: ForwardTarget[] }>;
      dm: ForwardTarget[];
    } = { serverGroups: [], dm: [] };

    servers.forEach((server, idx) => {
      const channels = channelQueries[idx]?.data || [];
      const items: ForwardTarget[] = [];

      for (const channel of channels) {
        if (channel.type !== ChannelType.GUILD_TEXT) continue;
        if (channel._id === currentChannelId) continue;
        if (Array.isArray(channel.permissions) && !channel.permissions.includes('SEND_MESSAGES')) continue;
        items.push({
          channelId: channel._id,
          serverId: server._id,
          label: `#${channel.name || t('notification.channel.unnamed')}`,
        });
      }

      if (items.length) {
        items.sort((a, b) => a.label.localeCompare(b.label));
        results.serverGroups.push({ serverId: server._id, serverName: server.name || t('server.fallback'), channels: items });
      }
    });

    results.serverGroups.sort((a, b) => a.serverName.localeCompare(b.serverName));

    for (const dm of dmChannels) {
      if (dm._id === currentChannelId) continue;
      const otherUser = dm.recipients?.find((r) => typeof r === 'object' && r._id !== user?._id) as any;
      results.dm.push({
        channelId: dm._id,
        serverId: undefined,
        label: otherUser?.username ? `@${otherUser.username}` : dm.name || t('notification.channel.dm'),
      });
    }

    results.dm.sort((a, b) => a.label.localeCompare(b.label));
    return results;
  }, [channelQueries, currentChannelId, dmChannels, servers, t, user?._id]);

  const forwardPayload = useMemo(() => {
    if (!message) return null;
    const authorId = typeof message.authorId === 'object' ? message.authorId : undefined;
    return {
      forwardedFromLabel: sourceLabel || undefined,
      forwardedMessage: {
        _id: message._id,
        type: message.type,
        content: message.content,
        payload: message.payload,
        attachments: message.attachments || [],
        ...(authorId ? { authorId } : {}),
        createdAt: message.createdAt,
      },
    };
  }, [message, sourceLabel]);

  const handleConfirm = async () => {
    if (!message || !target || !forwardPayload) return;
    setIsLoading(true);
    try {
      await messageApi.send(target.serverId, target.channelId, {
        type: 'app/x-forward-card',
        payload: forwardPayload,
      });
      await queryClient.invalidateQueries({ queryKey: ['messages', target.channelId] });
      closeModal();
    } catch (e) {
      console.error('Failed to forward message:', e);
    } finally {
      setIsLoading(false);
    }
  };

  if (!message) return null;

  return (
    <ConfirmModal
      title={t('forward.title')}
      description={t('forward.description')}
      confirmText={t('message.menu.forward')}
      cancelText={t('common.cancel')}
      onConfirm={handleConfirm}
      onCancel={closeModal}
      isLoading={isLoading}
      confirmDisabled={!target}
      isDestructive={false}
    >
      <div className="mt-4">
        <div className="text-xs text-mew-textMuted mb-2">{t('forward.target')}</div>
        <div className="max-h-64 overflow-y-auto custom-scrollbar border border-mew-divider/60 rounded bg-[#2B2D31]">
          {!!targets.serverGroups.length && (
            <div className="p-2">
              <div className="text-[11px] font-bold text-mew-textMuted uppercase mb-2">{t('forward.servers')}</div>
              <div className="space-y-2">
                {targets.serverGroups.map((group) => (
                  <div key={group.serverId} className="space-y-1">
                    <div className="text-[11px] font-bold text-mew-textMuted uppercase px-1">
                      {group.serverName}
                    </div>
                    <div className="space-y-1">
                      {group.channels.map((t) => (
                        <button
                          key={`server:${group.serverId}:${t.channelId}`}
                          type="button"
                          className={clsx(
                            'w-full flex items-center justify-between px-2 py-2 rounded text-sm transition-colors',
                            target?.channelId === t.channelId
                              ? 'bg-mew-accent/20 text-white'
                              : 'hover:bg-[#35373C] text-mew-textMuted hover:text-white'
                          )}
                          onClick={() => setTarget(t)}
                        >
                          <span className="truncate">{t.label}</span>
                          {target?.channelId === t.channelId && <Icon icon="mdi:check" width="18" />}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!!targets.dm.length && (
            <div className={clsx('p-2', targets.serverGroups.length ? 'border-t border-mew-divider/60' : '')}>
              <div className="text-[11px] font-bold text-mew-textMuted uppercase mb-1">{t('forward.dms')}</div>
              <div className="space-y-1">
                {targets.dm.map((t) => (
                  <button
                    key={`dm:${t.channelId}`}
                    type="button"
                    className={clsx(
                      'w-full flex items-center justify-between px-2 py-2 rounded text-sm transition-colors',
                      target?.channelId === t.channelId
                        ? 'bg-mew-accent/20 text-white'
                        : 'hover:bg-[#35373C] text-mew-textMuted hover:text-white'
                    )}
                    onClick={() => setTarget(t)}
                  >
                    <span className="truncate">{t.label}</span>
                    {target?.channelId === t.channelId && <Icon icon="mdi:check" width="18" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!targets.serverGroups.length && !targets.dm.length && (
            <div className="p-4 text-sm text-mew-textMuted">{t('forward.noTargets')}</div>
          )}
        </div>

        <div className="mt-3 text-xs text-mew-textMuted">
          {t('forward.sendsAs')} <span className="text-mew-text">{t('forward.forwardCard')}</span>
        </div>
      </div>
    </ConfirmModal>
  );
};

export default ForwardMessageModal;

