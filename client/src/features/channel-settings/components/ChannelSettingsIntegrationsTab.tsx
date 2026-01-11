import { WebhookManager } from '../../channel/modals/WebhookManager';

export const ChannelSettingsIntegrationsTab: React.FC<{ serverId: string; channel: any }> = ({ serverId, channel }) => {
  return (
    <div className="animate-fade-in overflow-y-auto custom-scrollbar h-full p-4 md:p-0">
      <WebhookManager serverId={serverId} channel={channel} />
    </div>
  );
};
