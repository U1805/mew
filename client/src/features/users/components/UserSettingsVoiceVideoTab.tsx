import React from 'react';
import { useI18n } from '../../../shared/i18n';
import type { VoiceSettings } from '../../../shared/stores/voiceSettingsStore';
import { Icon } from '@iconify/react';

// --- Constants (保持不变) ---
const TTS_MODEL_OPTIONS = [
  { value: 'namiai', label: 'namiai' },
  { value: 'qwen3-tts', label: 'qwen3-tts' },
];

const STT_MODEL_OPTIONS = [
  { value: 'qwen3-asr', label: 'qwen3-asr' },
  { value: 'qwen3-asr:itn', label: 'qwen3-asr:itn' },
  { value: 'whisper-1', label: 'whisper-1' },
];

const TTS_VOICE_OPTIONS_BY_MODEL: Record<string, Array<{ value: string; label: string }>> = {
  namiai: [{ value: 'doubao', label: 'doubao' }],
  'qwen3-tts': [
    { value: 'cherry', label: 'Cherry / 芊悦' },
    { value: 'serena', label: 'Serena / 苏瑶' },
    { value: 'ethan', label: 'Ethan / 晨煦' },
    { value: 'chelsie', label: 'Chelsie / 千雪' },
    { value: 'momo', label: 'Momo / 茉兔' },
    { value: 'vivian', label: 'Vivian / 十三' },
    { value: 'moon', label: 'Moon / 月白' },
    { value: 'maia', label: 'Maia / 四月' },
    { value: 'kai', label: 'Kai / 凯' },
    { value: 'nofish', label: 'Nofish / 不吃鱼' },
    { value: 'bella', label: 'Bella / 萌宝' },
    { value: 'jennifer', label: 'Jennifer / 詹妮弗' },
    { value: 'ryan', label: 'Ryan / 甜茶' },
    { value: 'katerina', label: 'Katerina / 卡捷琳娜' },
    { value: 'aiden', label: 'Aiden / 艾登' },
    { value: 'bodega', label: 'Bodega / 西班牙语-博德加' },
    { value: 'alek', label: 'Alek / 俄语-阿列克' },
    { value: 'dolce', label: 'Dolce / 意大利语-多尔切' },
    { value: 'sohee', label: 'Sohee / 韩语-素熙' },
    { value: 'ono anna', label: 'Ono Anna / 日语-小野杏' },
    { value: 'lenn', label: 'Lenn / 德语-莱恩' },
    { value: 'sonrisa', label: 'Sonrisa / 西班牙语拉美-索尼莎' },
    { value: 'emilien', label: 'Emilien / 法语-埃米尔安' },
    { value: 'andre', label: 'Andre / 葡萄牙语欧-安德雷' },
    { value: 'radio gol', label: 'Radio Gol / 葡萄牙语巴-拉迪奥·戈尔' },
    { value: 'eldric sage', label: 'Eldric Sage / 精品百人-沧明子' },
    { value: 'mia', label: 'Mia / 精品百人-乖小妹' },
    { value: 'mochi', label: 'Mochi / 精品百人-沙小弥' },
    { value: 'bellona', label: 'Bellona / 精品百人-燕铮莺' },
    { value: 'vincent', label: 'Vincent / 精品百人-田叔' },
    { value: 'bunny', label: 'Bunny / 精品百人-萌小姬' },
    { value: 'neil', label: 'Neil / 精品百人-阿闻' },
    { value: 'elias', label: 'Elias / 墨讲师' },
    { value: 'arthur', label: 'Arthur / 精品百人-徐大爷' },
    { value: 'nini', label: 'Nini / 精品百人-邻家妹妹' },
    { value: 'ebona', label: 'Ebona / 精品百人-诡婆婆' },
    { value: 'seren', label: 'Seren / 精品百人-小婉' },
    { value: 'pip', label: 'Pip / 精品百人-调皮小新' },
    { value: 'stella', label: 'Stella / 精品百人-美少女阿月' },
    { value: 'li', label: 'Li / 南京-老李' },
    { value: 'marcus', label: 'Marcus / 陕西-秦川' },
    { value: 'roy', label: 'Roy / 闽南-阿杰' },
    { value: 'peter', label: 'Peter / 天津-李彼得' },
    { value: 'eric', label: 'Eric / 四川-程川' },
    { value: 'rocky', label: 'Rocky / 粤语-阿强' },
    { value: 'kiki', label: 'Kiki / 粤语-阿清' },
    { value: 'sunny', label: 'Sunny / 四川-晴儿' },
    { value: 'jada', label: 'Jada / 上海-阿珍' },
    { value: 'dylan', label: 'Dylan / 北京-晓东' },
  ],
};

// --- Reusable UI Components (Discord Style) ---

// 1. Label: Discord 标志性的全大写、粗体、灰色标签
const DiscordLabel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <label className={`block text-xs font-bold text-[#B5BAC1] uppercase tracking-wide mb-2 ${className}`}>
    {children}
  </label>
);

// 2. Select: 模拟 Discord 下拉菜单 (深色背景 + 自定义箭头)
const DiscordSelect: React.FC<{
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}> = ({ value, onChange, options, disabled }) => (
  <div className="relative w-full">
    <select
      value={value}
      onChange={onChange}
      disabled={disabled}
      className={`
        w-full appearance-none rounded-[3px] 
        bg-[#1E1F22] text-[#DBDEE1] text-[16px]
        p-2.5 pr-10
        border-none outline-none
        transition-colors duration-200
        cursor-pointer
        focus:ring-0
        disabled:opacity-50 disabled:cursor-not-allowed
        hover:bg-[#1E1F22]/80
      `}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} className="bg-[#1E1F22] text-[#DBDEE1]">
          {opt.label}
        </option>
      ))}
    </select>
    {/* 自定义下拉箭头 */}
    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-[#DBDEE1]">
      <Icon icon="mdi:chevron-down" width="18" height="18" />
    </div>
  </div>
);

// 3. Divider: 分割线
const DiscordDivider = () => <div className="h-[1px] bg-[#3F4147] w-full my-6" />;

// --- Main Component ---

export const UserSettingsVoiceVideoTab: React.FC<{
  settings: VoiceSettings;
  onUpdate: (next: Partial<VoiceSettings>) => void;
}> = ({ settings, onUpdate }) => {
  const { t } = useI18n();
  const modelVoiceOptions = TTS_VOICE_OPTIONS_BY_MODEL[settings.ttsModel] || [];

  return (
    <div className="animate-in fade-in duration-300 max-w-3xl w-full">
      {/* Page Title */}
      <h2 className="text-[20px] font-bold text-[#F2F3F5] mb-6">
        {t('settings.voiceVideo')}
      </h2>

      {/* --- TTS Section --- */}
      <div className="space-y-5">
        <h3 className="text-xs font-bold text-[#B5BAC1] uppercase tracking-wide mb-4">
          {t('voiceVideo.ttsSection')}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* TTS Model */}
          <div>
            <DiscordLabel>{t('voiceVideo.ttsModel')}</DiscordLabel>
            <DiscordSelect
              value={settings.ttsModel}
              options={TTS_MODEL_OPTIONS}
              onChange={(e) => {
                const nextModel = e.target.value;
                const nextVoice = TTS_VOICE_OPTIONS_BY_MODEL[nextModel]?.[0]?.value || settings.ttsVoice;
                onUpdate({ ttsModel: nextModel, ttsVoice: nextVoice });
              }}
            />
          </div>

          {/* TTS Voice */}
          <div>
            <DiscordLabel>{t('voiceVideo.ttsVoice')}</DiscordLabel>
            <DiscordSelect
              value={settings.ttsVoice}
              options={modelVoiceOptions}
              onChange={(e) => onUpdate({ ttsVoice: e.target.value })}
              disabled={modelVoiceOptions.length === 0}
            />
          </div>
        </div>
      </div>

      <DiscordDivider />

      {/* --- STT Section --- */}
      <div className="space-y-5">
        <h3 className="text-xs font-bold text-[#B5BAC1] uppercase tracking-wide mb-4">
          {t('voiceVideo.sttSection')}
        </h3>

        {/* STT Model */}
        <div className="md:w-1/2">
          <DiscordLabel>{t('voiceVideo.sttModel')}</DiscordLabel>
          <DiscordSelect
            value={settings.sttModel}
            options={STT_MODEL_OPTIONS}
            onChange={(e) => onUpdate({ sttModel: e.target.value })}
          />
        </div>
        
        {/* Helper Text (Discord 风格的说明文字) */}
        <p className="text-sm text-[#949BA4] mt-2">
          {t('voiceVideo.sttModelHint')}
        </p>
      </div>
    </div>
  );
};
