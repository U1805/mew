import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useModalStore } from '../../../shared/stores';
import { Bot } from '../../../shared/types';
import { useCreateBot, useUpdateBot, useDeleteBot, useRegenerateBotToken } from '../hooks/useBots';
import { ConfirmModal } from '../../../shared/components/ConfirmModal';

export const BotEditorModal: React.FC = () => {
  const { closeModal, modalData } = useModalStore();

  const [internalBot, setInternalBot] = useState<Bot | undefined>(modalData?.bot);
  const isEditing = !!internalBot;

  const [name, setName] = useState(internalBot?.name || '');
  const [botType, setBotType] = useState(internalBot?.botType || 'Custom');
  const [dmEnabled, setDmEnabled] = useState(internalBot?.dmEnabled || false);
  const [config, setConfig] = useState(internalBot?.config || '{}');
  const [configError, setConfigError] = useState('');

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(internalBot?.avatarUrl || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showToken, setShowToken] = useState(false);
  const [currentToken, setCurrentToken] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);

  const createMutation = useCreateBot((newBot) => {
    setInternalBot(newBot);
    setCurrentToken(newBot.accessToken || '');
    setShowToken(true);
    toast.success('Bot created! Copy your token now, you won\'t see it again.');
  });

  const updateMutation = useUpdateBot();
  const deleteMutation = useDeleteBot();
  const regenTokenMutation = useRegenerateBotToken((data) => {
    setCurrentToken(data.accessToken);
    setShowToken(true);
    setShowRegenConfirm(false);
  });

  useEffect(() => {
    const initialValues = modalData?.bot as Bot | undefined;
    if (initialValues) {
      setName(initialValues.name);
      setBotType(initialValues.botType || 'Custom');
      setDmEnabled(initialValues.dmEnabled || false);
      setConfig(initialValues.config || '{}');
      setAvatarPreview(initialValues.avatarUrl || null);
    }

    try {
      JSON.parse(config);
      setConfigError('');
    } catch {
      setConfigError('Invalid JSON format');
    }
  }, [modalData]);

  const handleConfigChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setConfig(val);
    try {
      JSON.parse(val);
      setConfigError('');
    } catch {
      setConfigError('Invalid JSON format');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image size must be less than 2MB");
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    e.target.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Bot name is required');
      return;
    }
    if (configError) return;

    const formData = new FormData();
    formData.append('name', name);
    formData.append('botType', botType);
    formData.append('dmEnabled', String(dmEnabled));
    formData.append('config', config);
    if (avatarFile) {
      formData.append('avatar', avatarFile);
    }

    if (isEditing && internalBot) {
      updateMutation.mutate({ botId: internalBot._id, data: formData }, {
        onSuccess: () => toast.success('Bot updated!')
      });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = () => {
    if (internalBot) {
      deleteMutation.mutate(internalBot._id, {
        onSuccess: () => {
          setShowDeleteConfirm(false);
          closeModal();
        }
      });
    }
  };

  const handleRegenerateToken = () => {
    if (internalBot) {
      regenTokenMutation.mutate(internalBot._id);
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  if (showDeleteConfirm) {
    return (
      <ConfirmModal
        title="Delete Bot"
        description={`Are you sure you want to delete ${name}? This action cannot be undone.`}
        confirmText="Delete Bot"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
        isLoading={deleteMutation.isPending}
        isDestructive
      />
    );
  }

  if (showRegenConfirm) {
    return (
      <ConfirmModal
        title="Regenerate Token"
        description="Are you sure? The old token will stop working immediately. You will need to update any applications using this bot."
        confirmText="Regenerate"
        onConfirm={handleRegenerateToken}
        onCancel={() => setShowRegenConfirm(false)}
        isLoading={regenTokenMutation.isPending}
        isDestructive
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#313338] w-full max-w-2xl rounded-[4px] shadow-lg flex flex-col overflow-hidden animate-scale-in max-h-[90vh]">
        <div className="p-6 pb-0">
          <h2 className="text-xl font-bold text-white mb-2">{isEditing ? `Edit Bot - ${name}` : 'Create a Bot'}</h2>
          <p className="text-mew-textMuted text-sm">Configure your bot's appearance and settings.</p>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex gap-6 items-start">
              <div className="flex-shrink-0">
                <div
                  className="w-24 h-24 rounded-full bg-[#1E1F22] border-dashed border-2 border-[#4E5058] flex flex-col items-center justify-center cursor-pointer hover:border-mew-textMuted transition-colors relative overflow-hidden group"
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
                    <>
                      <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[10px] font-bold text-white uppercase">Change</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <Icon icon="mdi:camera-plus" className="text-mew-textMuted group-hover:text-white mb-1" width="24" />
                      <span className="text-[10px] font-bold text-mew-textMuted group-hover:text-white uppercase">Upload</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex-1 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">Bot Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-[#1E1F22] text-white p-2.5 rounded border-none focus:outline-none font-medium"
                    placeholder="My Awesome Bot"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">Type</label>
                  <select
                    value={botType}
                    onChange={(e) => setBotType(e.target.value)}
                    className="w-full bg-[#1E1F22] text-white p-2.5 rounded border-none focus:outline-none font-medium appearance-none"
                  >
                    <option value="Official">Official</option>
                    <option value="Custom">Custom</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="h-[1px] bg-[#3F4147]"></div>

            {isEditing && (
              <div className="bg-[#2B2D31] border border-[#1E1F22] rounded p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Icon icon="mdi:key-variant" className="text-mew-textMuted" />
                    <label className="text-xs font-bold text-mew-textMuted uppercase">Access Token</label>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowRegenConfirm(true)}
                    className="text-xs text-mew-accent hover:underline font-medium"
                  >
                    Regenerate
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className={clsx(
                      "flex-1 bg-[#1E1F22] p-2.5 rounded font-mono text-sm truncate",
                      !currentToken && "text-mew-textMuted",
                      currentToken && !showToken && "text-mew-textMuted blur-sm select-none cursor-pointer hover:blur-none transition-all",
                      currentToken && showToken && "text-white"
                    )}
                    onClick={() => currentToken && setShowToken(!showToken)}
                  >
                    {currentToken
                        ? (showToken ? currentToken : '********************************')
                        : 'Token is hidden. Regenerate to view.'
                    }
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (currentToken) {
                        navigator.clipboard.writeText(currentToken);
                        toast.success('Token copied!');
                      }
                    }}
                    disabled={!currentToken}
                    className="bg-mew-accent hover:bg-mew-accentHover text-white px-3 py-2 rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Copy
                  </button>
                </div>
                <p className="text-xs text-mew-textMuted mt-2">
                  Keep this token secret! Anyone with it can control your bot.
                </p>
              </div>
            )}

            <div>
              <div className="flex items-center mb-4">
                <div
                  className={clsx(
                    "w-10 h-6 rounded-full p-1 cursor-pointer transition-colors relative mr-3",
                    dmEnabled ? "bg-green-500" : "bg-[#80848E]"
                  )}
                  onClick={() => setDmEnabled(!dmEnabled)}
                >
                  <div
                    className={clsx(
                      "w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                      dmEnabled ? "translate-x-4" : "translate-x-0"
                    )}
                  ></div>
                </div>
                <div>
                  <div className="text-sm font-medium text-white">Allow Direct Messages</div>
                  <div className="text-xs text-mew-textMuted">Allow users to send DMs to this bot</div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">Configuration (JSON)</label>
                <textarea
                  value={config}
                  onChange={handleConfigChange}
                  className={clsx(
                    "w-full bg-[#1E1F22] text-white font-mono text-sm p-3 rounded border focus:outline-none min-h-[120px] resize-y",
                    configError ? "border-red-500" : "border-transparent focus:border-mew-textMuted"
                  )}
                  spellCheck={false}
                />
                {configError && <div className="text-red-400 text-xs mt-1">{configError}</div>}
              </div>
            </div>
          </form>
        </div>

        <div className="bg-[#2B2D31] p-4 flex justify-between items-center mt-auto border-t border-[#1E1F22]">
          {isEditing ? (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="text-red-400 hover:text-red-500 text-sm font-medium px-2"
            >
              Delete Bot
            </button>
          ) : <div></div>}
          <div className="flex gap-4">
            {isEditing ? (
                 <button type="button" onClick={closeModal} className="bg-mew-accent hover:bg-mew-accentHover text-white px-6 py-2 rounded-[3px] font-medium text-sm transition-colors">Done</button>
            ) : (
                <button type="button" onClick={closeModal} className="text-white hover:underline text-sm font-medium px-2 self-center">Cancel</button>
            )}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!name.trim() || isSubmitting || !!configError}
              className={clsx(
                "bg-mew-accent hover:bg-mew-accentHover text-white px-6 py-2 rounded-[3px] font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                !isEditing && createMutation.isSuccess && "hidden"
              )}
            >
              {isSubmitting ? (isEditing ? 'Saving...' : 'Creating...') : (isEditing ? 'Save Changes' : 'Create')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};