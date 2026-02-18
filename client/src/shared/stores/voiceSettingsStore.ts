import { create } from 'zustand';

const VOICE_SETTINGS_STORAGE_KEY = 'mew_voice_settings';

export type VoiceSettings = {
  ttsModel: string;
  ttsVoice: string;
  sttModel: string;
};

const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  ttsModel: 'namiai',
  ttsVoice: 'doubao',
  sttModel: 'qwen3-asr',
};

const sanitizeVoiceSettings = (raw: unknown): VoiceSettings => {
  if (!raw || typeof raw !== 'object') return DEFAULT_VOICE_SETTINGS;
  const payload = raw as Partial<VoiceSettings>;
  return {
    ttsModel: typeof payload.ttsModel === 'string' && payload.ttsModel.trim() ? payload.ttsModel.trim() : DEFAULT_VOICE_SETTINGS.ttsModel,
    ttsVoice: typeof payload.ttsVoice === 'string' && payload.ttsVoice.trim() ? payload.ttsVoice.trim() : DEFAULT_VOICE_SETTINGS.ttsVoice,
    sttModel: typeof payload.sttModel === 'string' && payload.sttModel.trim() ? payload.sttModel.trim() : DEFAULT_VOICE_SETTINGS.sttModel,
  };
};

const loadStoredVoiceSettings = (): VoiceSettings => {
  try {
    const raw = localStorage.getItem(VOICE_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_VOICE_SETTINGS;
    const parsed = JSON.parse(raw) as unknown;
    return sanitizeVoiceSettings(parsed);
  } catch {
    return DEFAULT_VOICE_SETTINGS;
  }
};

const saveVoiceSettings = (settings: VoiceSettings) => {
  try {
    localStorage.setItem(VOICE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage failures
  }
};

type VoiceSettingsState = {
  settings: VoiceSettings;
  updateSettings: (next: Partial<VoiceSettings>) => void;
  resetSettings: () => void;
};

export const useVoiceSettingsStore = create<VoiceSettingsState>((set, get) => ({
  settings: loadStoredVoiceSettings(),

  updateSettings: (next) => {
    const prev = get().settings;
    const merged = sanitizeVoiceSettings({
      ...prev,
      ...next,
    });
    saveVoiceSettings(merged);
    set({ settings: merged });
  },

  resetSettings: () => {
    saveVoiceSettings(DEFAULT_VOICE_SETTINGS);
    set({ settings: DEFAULT_VOICE_SETTINGS });
  },
}));

