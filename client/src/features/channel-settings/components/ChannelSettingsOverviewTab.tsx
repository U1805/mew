import { ChannelType, type Category } from '../../../shared/types';
import { useI18n } from '../../../shared/i18n';

export const ChannelSettingsOverviewTab: React.FC<{
  name: string;
  onNameChange: (next: string) => void;
  categoryId: string;
  onCategoryChange: (next: string) => void;
  categories: Category[] | undefined;
  topic: string;
  onTopicChange: (next: string) => void;
  channelType: ChannelType;
  url: string;
  onUrlChange: (next: string) => void;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
}> = ({ name, onNameChange, categoryId, onCategoryChange, categories, topic, onTopicChange, channelType, url, onUrlChange, isSaving, onSave, onCancel }) => {
  const { t } = useI18n();

  return (
    <div className="animate-fade-in overflow-y-auto custom-scrollbar h-full pb-10 p-4 md:p-0">
      <h2 className="text-xl font-bold text-white mb-6 hidden md:block">{t('channel.settings.overview')}</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">{t('channel.create.name')}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            className="w-full bg-[#1E1F22] text-white p-2.5 rounded border-none focus:outline-none focus:ring-0 font-medium"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">{t('channel.settings.category')}</label>
          <select
            value={categoryId}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="w-full bg-[#1E1F22] text-white p-2.5 rounded border-none focus:outline-none focus:ring-0 font-medium appearance-none"
          >
            <option value="">{t('channel.settings.noCategory')}</option>
            {categories?.map((cat) => (
              <option key={cat._id} value={cat._id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        {channelType === ChannelType.GUILD_WEB && (
          <div>
            <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">{t('channel.create.webUrl')}</label>
            <input
              type="url"
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
              className="w-full bg-[#1E1F22] text-white p-2.5 rounded border-none focus:outline-none focus:ring-0 font-medium"
              placeholder={t('channel.create.webUrlPlaceholder')}
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">{t('channel.settings.topic')}</label>
          <textarea
            className="w-full bg-[#1E1F22] text-white p-2.5 rounded border-none focus:outline-none focus:ring-0 font-medium h-20 resize-none"
            placeholder={t('channel.settings.topicPlaceholder')}
            value={topic}
            onChange={(e) => onTopicChange(e.target.value)}
          />
        </div>
        <div className="flex gap-4 pt-4">
          <button
            onClick={onSave}
            disabled={isSaving}
            className="bg-mew-accent hover:bg-mew-accentHover text-white px-6 py-2 rounded-[3px] font-medium text-sm transition-colors"
          >
            {t('common.saveChanges')}
          </button>
          <button onClick={onCancel} className="text-white hover:underline text-sm font-medium px-2 self-center">
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};
