import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { webhookApi, API_URL } from '../../../shared/services/api';
import { Webhook, Channel, ServerMember } from '../../../shared/types';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import { useWebhooks } from '../hooks/useWebhooks';
import toast from 'react-hot-toast';
import { useI18n } from '../../../shared/i18n';

interface WebhookManagerProps {
  serverId: string;
  channel: Channel;
}

export const WebhookManager = ({ serverId, channel }: WebhookManagerProps) => {
  const { t } = useI18n();
  const [view, setView] = useState<'list' | 'create' | 'edit'>('list');
  const [selectedWebhook, setSelectedWebhook] = useState<Webhook | null>(null);
  const [copiedWebhookId, setCopiedWebhookId] = useState<string | null>(null);
  
  const [name, setName] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (avatarPreview?.startsWith('blob:')) {
        URL.revokeObjectURL(avatarPreview);
      }
    };
  }, [avatarPreview]);

  const queryClient = useQueryClient();

  const { data: webhooks, isLoading } = useWebhooks(serverId, channel._id);

  const createMutation = useMutation({
    mutationFn: (data: FormData) => 
      webhookApi.create(serverId, channel._id, data),
    onSuccess: (res) => {
      const created = res.data as Webhook;
      queryClient.invalidateQueries({ queryKey: ['webhooks', channel._id] });
      queryClient.invalidateQueries({ queryKey: ['members', serverId] });
      setSelectedWebhook(created);
      setName(created.name);
      setAvatarFile(null);
      setAvatarPreview(created.avatarUrl || null);
      setView('edit');
    }
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; formData: FormData }) => 
      webhookApi.update(serverId, channel._id, data.id, data.formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks', channel._id] });
      queryClient.invalidateQueries({ queryKey: ['members', serverId] });
      setView('list');
      resetForm();
    }
  });

  const resetTokenMutation = useMutation({
    mutationFn: async (webhookId: string) => {
      const res = await webhookApi.resetToken(serverId, channel._id, webhookId);
      return res.data as { webhookId: string; token: string };
    },
    onSuccess: ({ webhookId, token }) => {
      setSelectedWebhook((prev) => (prev && prev._id === webhookId ? { ...prev, token } : prev));
      queryClient.setQueryData<Webhook[]>(['webhooks', channel._id], (prev) =>
        prev ? prev.map((wh) => (wh._id === webhookId ? { ...wh, token } : wh)) : prev
      );
      toast.success(t('webhook.tokenReset'));
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : t('webhook.tokenResetFailed');
      toast.error(message);
    },
  });

  const deleteMutation = useMutation<unknown, Error, Webhook, { previousMembers?: ServerMember[] }>({
    mutationFn: (webhook: Webhook) => webhookApi.delete(serverId, channel._id, webhook._id),
    onMutate: async (webhook: Webhook) => {
      await queryClient.cancelQueries({ queryKey: ['members', serverId] });

      const previousMembers = queryClient.getQueryData<ServerMember[]>(['members', serverId]);
      if (previousMembers) {
        queryClient.setQueryData<ServerMember[]>(['members', serverId], () =>
          previousMembers.filter(
            m => !(m.channelId === channel._id && m.userId?._id === webhook.botUserId)
          )
        );
      }

      return { previousMembers };
    },
    onError: (_err, _webhook, context) => {
      if (context?.previousMembers) {
        queryClient.setQueryData(['members', serverId], context.previousMembers);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks', channel._id] });
      queryClient.invalidateQueries({ queryKey: ['members', serverId] });
      setView('list');
      resetForm();
    }
  });

  const resetForm = () => {
    setName('');
    setAvatarFile(null);
    setAvatarPreview(null);
    setSelectedWebhook(null);
  };

  const handleEdit = (webhook: Webhook) => {
    setSelectedWebhook(webhook);
    setName(webhook.name);
    setAvatarFile(null);
    setAvatarPreview(webhook.avatarUrl || null);
    setView('edit');
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'];
    if (!allowed.includes(file.type)) {
      toast.error(t('webhook.imageFormatsOnly'));
      e.target.value = '';
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast.error(t('toast.imageSizeLimit'));
      e.target.value = '';
      return;
    }

    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    e.target.value = '';
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const formData = new FormData();
    formData.append('name', name);
    if (avatarFile) {
      formData.append('avatar', avatarFile);
    }

    if (view === 'create') {
      createMutation.mutate(formData);
    } else if (view === 'edit' && selectedWebhook) {
      updateMutation.mutate({ id: selectedWebhook._id, formData });
    }
  };

  const buildWebhookUrl = (webhook: Webhook) => {
    if (!webhook.token) return '';
    const base = API_URL.replace(/\/$/, '');
    const pathOrUrl = `${base}/webhooks/${webhook._id}/${webhook.token}`;
    try {
      return new URL(pathOrUrl, window.location.origin).toString();
    } catch {
      return pathOrUrl;
    }
  };

  const copyUrl = async (webhook: Webhook) => {
    const fallbackCopy = (text: string) => {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    };

    let token = webhook.token;
    if (!token) {
      try {
        const res = await webhookApi.getToken(serverId, channel._id, webhook._id);
        token = (res.data as { webhookId: string; token: string }).token;

        queryClient.setQueryData<Webhook[]>(['webhooks', channel._id], (prev) =>
          prev ? prev.map((wh) => (wh._id === webhook._id ? { ...wh, token } : wh)) : prev
        );
        setSelectedWebhook((prev) => (prev && prev._id === webhook._id ? { ...prev, token } : prev));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : t('webhook.loadTokenFailed');
        toast.error(message);
        return;
      }
    }

    const url = buildWebhookUrl({ ...webhook, token });

    try {
      if (!window.isSecureContext || !navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable');
      }

      await navigator.clipboard.writeText(url);
      setCopiedWebhookId(webhook._id);
      setTimeout(() => setCopiedWebhookId(null), 2000);
      toast.success(t('webhook.urlCopied'));
    } catch {
      const ok = fallbackCopy(url);
      if (!ok) {
        toast.error(t('webhook.copyUrlFailed'));
        return;
      }
      setCopiedWebhookId(webhook._id);
      setTimeout(() => setCopiedWebhookId(null), 2000);
      toast.success(t('webhook.urlCopied'));
    }
  };

  if (view === 'list') {
    return (
      <div>
         <div className="flex items-center justify-between mb-6">
            <h3 className="text-base font-bold text-white uppercase">{t('channel.settings.integrations')}</h3>
            <button 
              onClick={() => { resetForm(); setView('create'); }}
              className="bg-mew-accent hover:bg-mew-accentHover text-white px-3 py-1.5 rounded text-sm font-medium transition-colors"
            >
              {t('webhook.create')}
            </button>
         </div>
         
         <div className="text-sm text-mew-textMuted mb-4">
            {t('webhook.subtitle')}
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
                      <div className="text-xs text-mew-textMuted">
                        {wh.token ? `****${wh.token.slice(-4)}` : t('webhook.tokenHidden')}
                      </div>
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
                       {copiedWebhookId === wh._id ? t('message.copy.success') : t('webhook.copyUrl')}
                    </button>
                    <button onClick={() => handleEdit(wh)} className="bg-[#1E1F22] hover:bg-[#111214] text-white p-1.5 rounded transition-colors">
                       <Icon icon="mdi:pencil" width="16" />
                    </button>
                    <button onClick={() => deleteMutation.mutate(wh)} className="bg-[#1E1F22] hover:bg-red-500 text-white p-1.5 rounded transition-colors">
                       <Icon icon="mdi:trash-can-outline" width="16" />
                    </button>
                 </div>
               </div>
             ))}
             {webhooks?.length === 0 && (
               <div className="text-center py-8 text-mew-textMuted border border-dashed border-mew-darker rounded">
                 {t('webhook.none')}
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
           <h3 className="text-xl font-bold text-white">{view === 'create' ? t('webhook.create') : t('webhook.edit')}</h3>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
           <div>
              <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">{t('webhook.name')}</label>
              <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#1E1F22] text-white p-2.5 rounded border-none focus:outline-none focus:ring-0 font-medium"
                  placeholder={t('webhook.namePlaceholder')}
                  required
              />
           </div>
           
           <div>
              <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">{t('webhook.avatar')}</label>
              <div className="flex items-center gap-4">
                <div
                  className="w-16 h-16 rounded-full bg-[#1E1F22] border-dashed border-2 border-[#4E5058] flex items-center justify-center cursor-pointer hover:border-mew-textMuted transition-colors relative overflow-hidden"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/png, image/jpeg, image/gif"
                    onChange={handleFileChange}
                  />
                  {avatarPreview ? (
                    <img src={avatarPreview} alt={t('webhook.avatarPreview')} className="w-full h-full object-cover" />
                  ) : (
                    <Icon icon="mdi:camera-plus" className="text-mew-textMuted" width="22" />
                  )}
                </div>
                <div className="text-sm text-mew-textMuted">
                  {t('webhook.avatarHint')}
                </div>
              </div>
           </div>

           {view === 'edit' && selectedWebhook && (
              <div>
                 <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">{t('webhook.url')}</label>
                 <div className="flex">
                    <input
                       type="text"
                       readOnly
                      value={
                        selectedWebhook.token ? buildWebhookUrl(selectedWebhook) : ''
                      }
                      placeholder={selectedWebhook.token ? undefined : t('webhook.urlPlaceholderNoToken')}
                      disabled={!selectedWebhook.token}
                       className="w-full bg-[#1E1F22] text-mew-textMuted p-2.5 rounded-l border-none focus:outline-none focus:ring-0 font-medium text-sm"
                    />
                    <button 
                       type="button"
                      onClick={() => copyUrl(selectedWebhook)}
                      disabled={!selectedWebhook.token}
                       className={clsx(
                           "text-white px-4 rounded-r font-medium text-sm transition-colors min-w-[70px]",
                           copiedWebhookId === selectedWebhook._id
                             ? "bg-green-500 hover:bg-green-600"
                            : selectedWebhook.token
                              ? "bg-mew-accent hover:bg-mew-accentHover"
                              : "bg-[#4E5058] cursor-not-allowed"
                       )}
                    >
                      {copiedWebhookId === selectedWebhook._id ? t('message.copy.success') : t('invite.create.copy')}
                    </button>
                 </div>
                 {!selectedWebhook.token && (
                   <button
                     type="button"
                     onClick={() => resetTokenMutation.mutate(selectedWebhook._id)}
                     disabled={resetTokenMutation.isPending}
                     className="mt-2 bg-[#1E1F22] hover:bg-[#111214] text-white px-3 py-1.5 rounded text-xs font-medium transition-colors"
                   >
                     {resetTokenMutation.isPending ? t('webhook.resettingToken') : t('webhook.resetToken')}
                   </button>
                 )}
              </div>
            )}
           
           <div className="pt-4 flex justify-between">
              {view === 'edit' && selectedWebhook ? (
                  <button 
                    type="button"
                    onClick={() => deleteMutation.mutate(selectedWebhook)}
                    className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                  >
                    {t('webhook.delete')}
                  </button>
              ) : <div></div>}

              <div className="flex gap-4">
                  <button 
                     type="button" 
                     onClick={() => setView('list')}
                     className="text-white hover:underline text-sm font-medium px-2 self-center"
                  >
                    {t('common.cancel')}
                  </button>
                  <button 
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    className="bg-mew-accent hover:bg-mew-accentHover text-white px-6 py-2 rounded-[3px] font-medium text-sm transition-colors"
                  >
                    {t('server.settings.save')}
                  </button>
              </div>
           </div>
        </form>
    </div>
  );
};
