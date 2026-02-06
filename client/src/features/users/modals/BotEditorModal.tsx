import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useQuery } from '@tanstack/react-query';
import { useModalStore } from '../../../shared/stores';
import { Bot } from '../../../shared/types';
import { useCreateBot, useUpdateBot, useDeleteBot, useRegenerateBotToken } from '../hooks/useBots';
import { ConfirmModal } from '../../../shared/components/ConfirmModal';
import { infraApi } from '../../../shared/services/api';
import type { AvailableService } from '../../../shared/services/infra.api';
import { useI18n } from '../../../shared/i18n';
import {
  ConfigTemplateForm,
  buildInitialValueFromSchema,
  cleanValueForConfig,
  hydrateValueFromSchema,
  isTemplateSchemaLike,
  validateValueAgainstSchema,
} from '../components/ConfigTemplateForm';

export const BotEditorModal: React.FC = () => {
  const { closeModal, modalData } = useModalStore();
  const { t } = useI18n();

  const [internalBot, setInternalBot] = useState<Bot | undefined>(modalData?.bot);
  const isEditing = !!internalBot;

  const [name, setName] = useState(internalBot?.name || '');
  const [serviceType, setServiceType] = useState(internalBot?.serviceType || '');
  const [dmEnabled, setDmEnabled] = useState(internalBot?.dmEnabled || false);
  const [config, setConfig] = useState(internalBot?.config || '{}');
  const [configMode, setConfigMode] = useState<'visual' | 'json'>('json');
  const [configSchema, setConfigSchema] = useState<any>(null);
  const [visualValue, setVisualValue] = useState<any>(undefined);
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
    toast.success(t('bot.editor.created'));
  });

  const updateMutation = useUpdateBot();
  const deleteMutation = useDeleteBot();
  const regenTokenMutation = useRegenerateBotToken((data) => {
    setCurrentToken(data.accessToken);
    setShowToken(true);
    setShowRegenConfirm(false);
  });

  const { data: availableServices } = useQuery({
    queryKey: ['availableServices', isEditing ? 'includeOffline' : 'onlineOnly'],
    queryFn: async () => {
      const res = await infraApi.availableServices(isEditing ? { includeOffline: true } : undefined);
      return (res.data?.services || []) as AvailableService[];
    },
  });

  const serviceOptions = (availableServices || []).filter((s) => s.online || (isEditing && s.serviceType === serviceType));
  const selectedService = (availableServices || []).find((s) => s.serviceType === serviceType);

  const safeParseJSON = (raw: string): any | undefined => {
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  };

  useEffect(() => {
    if (isEditing) return;
    if (serviceType) return;
    const services = serviceOptions || [];
    if (services.length === 0) return;
    const preferred = services.find((s) => s.online) || services[0];
    setServiceType(preferred.serviceType);
  }, [isEditing, serviceOptions, serviceType]);

  useEffect(() => {
    const raw = selectedService?.configTemplate || '';
    const parsed = raw.trim() ? safeParseJSON(raw) : undefined;
    if (parsed && isTemplateSchemaLike(parsed)) {
      setConfigSchema(parsed);
      setConfigMode('visual');
    } else {
      setConfigSchema(null);
      setConfigMode('json');
    }
    setVisualValue(undefined);
  }, [selectedService?.configTemplate]);

  useEffect(() => {
    if (!configSchema) return;
    if (configMode !== 'visual') return;

    const base =
      visualValue === undefined
        ? ((): any => {
            const parsed = safeParseJSON(config);
            if (parsed !== undefined) return hydrateValueFromSchema(configSchema, parsed);
            return buildInitialValueFromSchema(configSchema);
          })()
        : visualValue;
    if (base !== visualValue) setVisualValue(base);

    const cleaned = cleanValueForConfig(configSchema, base);
    const errs = validateValueAgainstSchema(configSchema, cleaned);
    if (errs.length > 0) {
      setConfigError(errs[0] + (errs.length > 1 ? ` (+${errs.length - 1} more)` : ''));
    } else {
      setConfigError('');
    }
    setConfig(cleaned === undefined ? '{}' : JSON.stringify(cleaned, null, 2));
  }, [configMode, configSchema, visualValue]);

  useEffect(() => {
    if (isEditing) return;
    if (!serviceType) return;
    if (configSchema) return; // schema templates use visual editor instead of auto-inserting JSON examples

    const template = selectedService?.configTemplate || '';
    if (!template.trim()) return;

    const current = config.trim();
    if (current && current !== '{}' && current !== 'null') return;
    if (config !== template) setConfig(template);
  }, [config, configSchema, isEditing, selectedService?.configTemplate, serviceType]);

  useEffect(() => {
    const initialValues = modalData?.bot as Bot | undefined;
    if (initialValues) {
      setName(initialValues.name);
      setServiceType(initialValues.serviceType || '');
      setDmEnabled(initialValues.dmEnabled || false);
      setConfig(initialValues.config || '{}');
      setAvatarPreview(initialValues.avatarUrl || null);
    }
  }, [modalData]);

  useEffect(() => {
    if (configMode !== 'json') return;
    try {
      JSON.parse(config);
      setConfigError('');
    } catch {
      setConfigError(t('bot.editor.invalidJson'));
    }
  }, [config, configMode]);

  const handleConfigChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setConfig(e.target.value);
  };

  const handleFormatConfig = () => {
    try {
      const parsed = JSON.parse(config);
      setConfig(JSON.stringify(parsed, null, 2));
    } catch {
      toast.error(t('bot.editor.invalidJson'));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Image size must be less than 50MB");
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    e.target.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error(t('bot.editor.nameRequired'));
      return;
    }
    if (!serviceType) {
      toast.error(t('bot.editor.serviceTypeRequired'));
      return;
    }
    if (configError) return;

    const formData = new FormData();
    formData.append('name', name);
    formData.append('serviceType', serviceType);
    formData.append('dmEnabled', String(dmEnabled));
    formData.append('config', config);
    if (avatarFile) {
      formData.append('avatar', avatarFile);
    }

    if (isEditing && internalBot) {
      updateMutation.mutate({ botId: internalBot._id, data: formData }, {
        onSuccess: () => toast.success(t('bot.editor.updated'))
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
        title={t('bot.editor.deleteTitle')}
        description={t('bot.editor.deleteDesc', { name })}
        confirmText={t('bot.editor.deleteConfirm')}
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
        title={t('bot.editor.regenTitle')}
        description={t('bot.editor.regenDesc')}
        confirmText={t('bot.editor.regenConfirm')}
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
          <h2 className="text-xl font-bold text-white mb-2">{isEditing ? t('bot.editor.editTitle', { name }) : t('bot.editor.createTitle')}</h2>
          <p className="text-mew-textMuted text-sm">{t('bot.editor.subtitle')}</p>
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
                      <img src={avatarPreview} alt={t('modal.preview')} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[10px] font-bold text-white uppercase">{t('account.change')}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <Icon icon="mdi:camera-plus" className="text-mew-textMuted group-hover:text-white mb-1" width="24" />
                      <span className="text-[10px] font-bold text-mew-textMuted group-hover:text-white uppercase">{t('server.create.upload')}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex-1 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">{t('bot.editor.botName')}</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-[#1E1F22] text-white p-2.5 rounded border-none focus:outline-none font-medium"
                    placeholder={t('bot.editor.botNamePlaceholder')}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">{t('bot.editor.serviceType')}</label>
                  <select
                    value={serviceType}
                    onChange={(e) => setServiceType(e.target.value)}
                    className="w-full bg-[#1E1F22] text-white p-2.5 rounded border-none focus:outline-none font-medium appearance-none"
                    disabled={!isEditing && serviceOptions.length === 0}
                  >
                    <option value="" disabled>{t('bot.editor.selectServiceType')}</option>
                    {serviceOptions.map((s) => (
                      <option key={s.serviceType} value={s.serviceType}>
                        {(s.serverName && s.serverName !== s.serviceType ? ` [${s.serviceType}] ` : '') + (s.serverName || s.serviceType)}
                      </option>
                    ))}
                  </select>
                  {!isEditing && serviceOptions.length === 0 && (
                    <p className="text-xs text-mew-textMuted mt-2">{t('bot.editor.noOnlineServices')}</p>
                  )}
                  {!!selectedService?.description && (
                    <p className="text-xs text-mew-textMuted mt-2 whitespace-pre-wrap">{selectedService.description}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="h-[1px] bg-[#3F4147]"></div>

            {isEditing && (
              <div className="bg-[#2B2D31] border border-[#1E1F22] rounded p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Icon icon="mdi:key-variant" className="text-mew-textMuted" />
                    <label className="text-xs font-bold text-mew-textMuted uppercase">{t('bot.editor.accessToken')}</label>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowRegenConfirm(true)}
                    className="text-xs text-mew-accent hover:underline font-medium"
                  >
                    {t('bot.editor.regenConfirm')}
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
                        : t('bot.editor.tokenHidden')
                    }
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (currentToken) {
                        navigator.clipboard.writeText(currentToken);
                        toast.success(t('bot.editor.tokenCopied'));
                      }
                    }}
                    disabled={!currentToken}
                    className="bg-mew-accent hover:bg-mew-accentHover text-white px-3 py-2 rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('invite.create.copy')}
                  </button>
                </div>
                <p className="text-xs text-mew-textMuted mt-2">
                  {t('bot.editor.tokenWarning')}
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
                  <div className="text-sm font-medium text-white">{t('bot.editor.allowDmTitle')}</div>
                  <div className="text-xs text-mew-textMuted">{t('bot.editor.allowDmDesc')}</div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <label className="block text-xs font-bold text-mew-textMuted uppercase">
                      {t('bot.editor.configuration')} {configSchema ? '' : '(JSON)'}
                    </label>
                    {configSchema && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setConfigMode('visual')}
                          className={clsx(
                            'text-xs font-medium px-2 py-1 rounded',
                            configMode === 'visual' ? 'bg-[#1E1F22] text-white' : 'bg-transparent text-mew-textMuted hover:text-white'
                          )}
                        >
                          {t('bot.editor.visual')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfigMode('json')}
                          className={clsx(
                            'text-xs font-medium px-2 py-1 rounded',
                            configMode === 'json' ? 'bg-[#1E1F22] text-white' : 'bg-transparent text-mew-textMuted hover:text-white'
                          )}
                        >
                          JSON
                        </button>
                      </div>
                    )}
                  </div>

                  {configMode === 'json' && (
                    <button
                      type="button"
                      onClick={handleFormatConfig}
                      disabled={!config.trim() || !!configError}
                      className="flex items-center gap-1.5 text-xs text-mew-textMuted hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title={t('bot.editor.formatJson')}
                    >
                      <Icon icon="mdi:format-indent-increase" width="16" />
                      {t('bot.editor.format')}
                    </button>
                  )}
                </div>

                {configSchema && configMode === 'visual' ? (
                  <div className={clsx('bg-[#1E1F22] rounded border p-3', configError ? 'border-red-500' : 'border-transparent')}>
                    <ConfigTemplateForm
                      schema={configSchema}
                      value={visualValue === undefined ? buildInitialValueFromSchema(configSchema) : visualValue}
                      onChange={setVisualValue}
                    />
                  </div>
                ) : (
                  <textarea
                    value={config}
                    onChange={handleConfigChange}
                    className={clsx(
                      "w-full bg-[#1E1F22] text-white font-mono text-sm p-3 rounded border focus:outline-none min-h-[120px] resize-y",
                      configError ? "border-red-500" : "border-transparent focus:border-mew-textMuted"
                    )}
                    spellCheck={false}
                  />
                )}

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
              {t('bot.editor.deleteConfirm')}
            </button>
          ) : <div></div>}
          <div className="flex gap-4">
            <button type="button" onClick={closeModal} className="text-white hover:underline text-sm font-medium px-2 self-center">{t('common.cancel')}</button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!name.trim() || isSubmitting || !!configError}
              className={clsx(
                "bg-mew-accent hover:bg-mew-accentHover text-white px-6 py-2 rounded-[3px] font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                !isEditing && createMutation.isSuccess && "hidden"
              )}
            >
              {isSubmitting ? (isEditing ? t('common.saving') : t('bot.editor.creating')) : (isEditing ? t('common.saveChanges') : t('server.create.create'))}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
