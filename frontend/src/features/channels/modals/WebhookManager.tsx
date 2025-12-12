import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { webhookApi, API_URL } from '../../../shared/services/api';
import { Webhook, Channel } from '../../../shared/types';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import { useWebhooks } from '../hooks/useWebhooks';

interface WebhookManagerProps {
  serverId: string;
  channel: Channel;
}

export const WebhookManager = ({ serverId, channel }: WebhookManagerProps) => {
  const [view, setView] = useState<'list' | 'create' | 'edit'>('list');
  const [selectedWebhook, setSelectedWebhook] = useState<Webhook | null>(null);
  const [copiedWebhookId, setCopiedWebhookId] = useState<string | null>(null);
  
  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  const queryClient = useQueryClient();

  const { data: webhooks, isLoading } = useWebhooks(serverId, channel._id);

  const createMutation = useMutation({
    mutationFn: (data: { name: string; avatarUrl?: string }) => 
      webhookApi.create(serverId, channel._id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks', channel._id] });
      setView('list');
      resetForm();
    }
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; name?: string; avatarUrl?: string }) => 
      webhookApi.update(serverId, channel._id, data.id, { name: data.name, avatarUrl: data.avatarUrl }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks', channel._id] });
      setView('list');
      resetForm();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => webhookApi.delete(serverId, channel._id, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks', channel._id] });
      setView('list');
      resetForm();
    }
  });

  const resetForm = () => {
    setName('');
    setAvatarUrl('');
    setSelectedWebhook(null);
  };

  const handleEdit = (webhook: Webhook) => {
    setSelectedWebhook(webhook);
    setName(webhook.name);
    setAvatarUrl(webhook.avatarUrl || '');
    setView('edit');
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (view === 'create') {
      createMutation.mutate({ name, avatarUrl });
    } else if (view === 'edit' && selectedWebhook) {
      updateMutation.mutate({ id: selectedWebhook._id, name, avatarUrl });
    }
  };

  const copyUrl = (webhook: Webhook) => {
    const url = `${API_URL}/webhooks/${webhook._id}/${webhook.token}`;
    navigator.clipboard.writeText(url);
    setCopiedWebhookId(webhook._id);
    setTimeout(() => setCopiedWebhookId(null), 2000);
  };

  if (view === 'list') {
    return (
      <div>
         <div className="flex items-center justify-between mb-6">
            <h3 className="text-base font-bold text-white uppercase">Integrations</h3>
            <button 
              onClick={() => { resetForm(); setView('create'); }}
              className="bg-mew-accent hover:bg-mew-accentHover text-white px-3 py-1.5 rounded text-sm font-medium transition-colors"
            >
              Create Webhook
            </button>
         </div>
         
         <div className="text-sm text-mew-textMuted mb-4">
            Webhooks allow external services to send messages to this channel.
         </div>

         {isLoading ? (
           <div className="flex justify-center py-8"><Icon icon="mdi:loading" className="animate-spin text-mew-textMuted" width="24"/></div>
         ) : (
           <div className="space-y-2">
             {webhooks?.map(wh => (
               <div key={wh._id} className="bg-[#2B2D31] p-3 rounded flex items-center justify-between group">
                 <div className="flex items-center">
                    <div className="w-10 h-10 rounded-full bg-mew-darker flex items-center justify-center mr-3 overflow-hidden">
                       {wh.avatarUrl ? (
                         <img src={wh.avatarUrl} alt={wh.name} className="w-full h-full object-cover" />
                       ) : (
                         <Icon icon="mdi:robot" className="text-mew-textMuted" width="20" />
                       )}
                    </div>
                    <div>
                      <div className="font-bold text-white">{wh.name}</div>
                      <div className="text-xs text-mew-textMuted">****{wh.token.slice(-4)}</div>
                    </div>
                 </div>
                 <div className="flex items-center space-x-2">
                    <button 
                        onClick={() => copyUrl(wh)} 
                        className={clsx(
                            "text-white px-3 py-1.5 rounded text-xs font-medium transition-colors min-w-[80px]",
                            copiedWebhookId === wh._id 
                                ? "bg-green-500 hover:bg-green-600" 
                                : "bg-[#1E1F22] hover:bg-[#111214]"
                        )}
                    >
                       {copiedWebhookId === wh._id ? 'Copied' : 'Copy URL'}
                    </button>
                    <button onClick={() => handleEdit(wh)} className="bg-[#1E1F22] hover:bg-[#111214] text-white p-1.5 rounded transition-colors">
                       <Icon icon="mdi:pencil" width="16" />
                    </button>
                    <button onClick={() => deleteMutation.mutate(wh._id)} className="bg-[#1E1F22] hover:bg-red-500 text-white p-1.5 rounded transition-colors">
                       <Icon icon="mdi:trash-can-outline" width="16" />
                    </button>
                 </div>
               </div>
             ))}
             {webhooks?.length === 0 && (
               <div className="text-center py-8 text-mew-textMuted border border-dashed border-mew-darker rounded">
                 No webhooks yet.
               </div>
             )}
           </div>
         )}
      </div>
    );
  }

  return (
    <div>
        <div className="flex items-center mb-6">
           <button onClick={() => setView('list')} className="mr-2 text-mew-textMuted hover:text-white">
              <Icon icon="mdi:arrow-left" width="24" />
           </button>
           <h3 className="text-xl font-bold text-white">{view === 'create' ? 'Create Webhook' : 'Edit Webhook'}</h3>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
           <div>
              <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">Name</label>
              <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#1E1F22] text-white p-2.5 rounded border-none focus:outline-none focus:ring-0 font-medium"
                  placeholder="Captain Hook"
                  required
              />
           </div>
           
           <div>
              <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">Avatar URL</label>
              <input
                  type="text"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  className="w-full bg-[#1E1F22] text-white p-2.5 rounded border-none focus:outline-none focus:ring-0 font-medium"
                  placeholder="https://..."
              />
           </div>

           {view === 'edit' && selectedWebhook && (
             <div>
                <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">Webhook URL</label>
                <div className="flex">
                   <input
                      type="text"
                      readOnly
                      value={`${API_URL}/webhooks/${selectedWebhook._id}/${selectedWebhook.token}`}
                      className="w-full bg-[#1E1F22] text-mew-textMuted p-2.5 rounded-l border-none focus:outline-none focus:ring-0 font-medium text-sm"
                   />
                   <button 
                      type="button"
                      onClick={() => copyUrl(selectedWebhook)}
                      className={clsx(
                          "text-white px-4 rounded-r font-medium text-sm transition-colors min-w-[70px]",
                          copiedWebhookId === selectedWebhook._id
                            ? "bg-green-500 hover:bg-green-600"
                            : "bg-mew-accent hover:bg-mew-accentHover"
                      )}
                   >
                     {copiedWebhookId === selectedWebhook._id ? 'Copied' : 'Copy'}
                   </button>
                </div>
             </div>
           )}
           
           <div className="pt-4 flex justify-between">
              {view === 'edit' && selectedWebhook ? (
                  <button 
                    type="button"
                    onClick={() => deleteMutation.mutate(selectedWebhook._id)}
                    className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                  >
                    Delete Webhook
                  </button>
              ) : <div></div>}

              <div className="flex gap-4">
                  <button 
                     type="button" 
                     onClick={() => setView('list')}
                     className="text-white hover:underline text-sm font-medium px-2 self-center"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    className="bg-mew-accent hover:bg-mew-accentHover text-white px-6 py-2 rounded-[3px] font-medium text-sm transition-colors"
                  >
                    Save
                  </button>
              </div>
           </div>
        </form>
    </div>
  );
};
