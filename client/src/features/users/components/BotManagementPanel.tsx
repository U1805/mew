import { Icon } from '@iconify/react';
import { useModalStore } from '../../../shared/stores';
import { useBots } from '../hooks/useBots';

export const BotManagementPanel = () => {
  const { openModal } = useModalStore();
  const { data: bots, isLoading } = useBots();

  return (
    <div className="animate-fade-in pb-10">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">My Bots</h2>
        <button
          onClick={() => openModal('manageBot')}
          className="bg-mew-accent hover:bg-mew-accentHover text-white px-4 py-2 rounded text-sm font-medium transition-colors"
        >
          Create Bot
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center mt-10">
          <Icon icon="mdi:loading" className="animate-spin text-mew-textMuted" width="32" />
        </div>
      ) : !bots || bots.length === 0 ? (
        <div className="bg-[#2B2D31] rounded-lg p-8 text-center border border-[#1E1F22] border-dashed">
          <div className="w-16 h-16 bg-[#1E1F22] rounded-full flex items-center justify-center mx-auto mb-4">
            <Icon icon="mdi:robot-outline" className="text-mew-textMuted" width="32" />
          </div>
          <h3 className="text-white font-bold mb-2">No bots yet</h3>
          <p className="text-mew-textMuted text-sm mb-4 max-w-sm mx-auto">
            Create a bot to automate tasks, moderate your server, or just for fun.
          </p>
          <button
            onClick={() => openModal('manageBot')}
            className="text-mew-accent hover:underline text-sm font-medium"
          >
            Create your first bot
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {bots.map((bot) => (
            <div
              key={bot._id}
              className="bg-[#2B2D31] p-4 rounded-lg flex items-center justify-between group hover:bg-[#303237] transition-colors"
            >
              <div className="flex items-center">
                <div className="w-12 h-12 rounded-full bg-[#1E1F22] mr-4 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {bot.avatarUrl ? (
                    <img src={bot.avatarUrl} alt={bot.name} className="w-full h-full object-cover" />
                  ) : (
                    <Icon icon="mdi:robot" className="text-mew-textMuted" width="24" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-white font-bold">{bot.name}</h3>
                    <span className="text-[10px] bg-[#5865F2] text-white px-1.5 py-0.5 rounded uppercase font-bold">BOT</span>
                  </div>
                  <div className="text-xs text-mew-textMuted mt-0.5 flex items-center gap-3">
                    <span>{bot.serviceType}</span>
                    <span className="w-1 h-1 bg-mew-textMuted rounded-full"></span>
                    <span>{bot.dmEnabled ? 'DM Enabled' : 'DM Disabled'}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => openModal('manageBot', { bot })}
                className="bg-[#1E1F22] hover:bg-[#111214] text-white px-4 py-2 rounded text-sm font-medium transition-colors"
              >
                Edit
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
