import React from 'react';
import { Icon } from '@iconify/react';
import { useQuery } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { infraApi } from '../../../shared/services/api';
import type { AvailableService } from '../../../shared/services/infra.api';
import { useI18n } from '../../../shared/i18n';

// --- Helpers ---

const isImageIcon = (icon?: string) => {
  if (!icon) return false;
  return icon.startsWith('http://') || icon.startsWith('https://') || icon.startsWith('data:');
};

const isIconifyIcon = (icon?: string) => {
  if (!icon) return false;
  if (isImageIcon(icon)) return false;
  return icon.includes(':');
};

// --- Components ---

const ServiceIcon: React.FC<{ icon?: string; title: string }> = ({ icon, title }) => {
  return (
    <div className="relative w-12 h-12 rounded-[16px] bg-[#313338] flex items-center justify-center overflow-hidden flex-shrink-0 transition-transform group-hover:scale-105">
      {isImageIcon(icon) ? (
        <img src={icon} alt={title} className="w-full h-full object-cover" />
      ) : isIconifyIcon(icon) ? (
        <Icon icon={icon!} className="text-gray-300" width="28" />
      ) : (
        <Icon icon="mdi:puzzle" className="text-gray-400" width="28" />
      )}
    </div>
  );
};

const PluginBadge: React.FC = () => (
  <div className="flex items-center gap-1 bg-[#5865F2] px-1.5 rounded-[4px] h-[15px] select-none">
    <Icon icon="mdi:check" className="text-white w-2.5 h-2.5" />
    <span className="text-[10px] font-bold text-white leading-none uppercase tracking-wide">
      PLUGIN
    </span>
  </div>
);

const ServiceDetailsModal: React.FC<{ service: AvailableService; onClose: () => void }> = ({
  service,
  onClose,
}) => {
  const { t } = useI18n();
  const title = service.serverName?.trim() || service.serviceType;
  const description = service.description?.trim();
  const icon = service.icon?.trim();
  const configTemplate = service.configTemplate?.trim();

  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  React.useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(t);
  }, [copied]);

  const handleCopy = async () => {
    if (!configTemplate) return;
    try {
      await navigator.clipboard.writeText(configTemplate);
      setCopied(true);
    } catch {
      // ignore
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={t('plugin.details.aria', { title })}
    >
      <div className="bg-[#232428] w-full max-w-2xl rounded-lg shadow-2xl overflow-hidden animate-scale-in border border-[#1E1F22]">
        <div className="px-5 py-4 flex items-start justify-between gap-4 border-b border-[#1E1F22]">
          <div className="flex items-start gap-3 min-w-0">
            <ServiceIcon icon={icon} title={title} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-white truncate max-w-full">{title}</h2>
                <PluginBadge />
              </div>
              <div className="text-xs text-[#949BA4] font-mono mt-0.5">{service.serviceType}</div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="w-9 h-9 rounded-full bg-[#2B2D31] hover:bg-[#404249] flex items-center justify-center text-[#949BA4] hover:text-white transition-colors flex-shrink-0"
            aria-label={t('common.close')}
          >
            <Icon icon="mdi:close" width="18" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-[#111214] rounded-md p-3 border border-[#1E1F22]">
              <div className="text-[11px] font-bold text-[#949BA4] uppercase tracking-wide">{t('plugin.status')}</div>
              <div className="mt-1 flex items-center gap-2">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${service.online ? 'bg-[#23A559] shadow-[0_0_6px_rgba(35,165,89,0.35)]' : 'bg-[#80848E]'}`}
                />
                <div className="text-sm font-semibold text-white">{service.online ? t('plugin.online') : t('plugin.offline')}</div>
              </div>
            </div>

            <div className="bg-[#111214] rounded-md p-3 border border-[#1E1F22]">
              <div className="text-[11px] font-bold text-[#949BA4] uppercase tracking-wide">
                {t('plugin.connections')}
              </div>
              <div className="mt-1 flex items-center gap-2 text-white">
                <Icon icon="mdi:server-network" width="16" className="text-[#949BA4]" />
                <div className="text-sm font-semibold">{service.connections}</div>
              </div>
            </div>

            <div className="bg-[#111214] rounded-md p-3 border border-[#1E1F22]">
              <div className="text-[11px] font-bold text-[#949BA4] uppercase tracking-wide">{t('plugin.config')}</div>
              <div className="mt-1 text-sm font-semibold text-white">
                {configTemplate ? t('plugin.available') : t('plugin.none')}
              </div>
            </div>
          </div>

          <div className="bg-[#111214] rounded-md p-4 border border-[#1E1F22]">
            <div className="text-[11px] font-bold text-[#949BA4] uppercase tracking-wide mb-2">
              {t('plugin.description')}
            </div>
            {description ? (
              <p className="text-sm text-[#B5BAC1] leading-relaxed whitespace-pre-wrap">{description}</p>
            ) : (
              <p className="text-sm text-[#5C5E66] italic select-none">{t('plugin.noDescription')}</p>
            )}
          </div>

          {configTemplate && (
            <div className="bg-[#111214] rounded-md border border-[#1E1F22] overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between gap-3 border-b border-[#1E1F22]">
                <div className="text-[11px] font-bold text-[#949BA4] uppercase tracking-wide">
                  {t('plugin.configTemplate')}
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded bg-[#2B2D31] hover:bg-[#404249] text-white transition-colors"
                  aria-label={t('plugin.copyConfigTemplate')}
                  title={t('plugin.copyToClipboard')}
                >
                  <Icon icon={copied ? 'mdi:check' : 'mdi:content-copy'} width="14" />
                  <span>{copied ? t('message.copy.success') : t('invite.create.copy')}</span>
                </button>
              </div>
              <pre className="p-4 text-xs text-[#B5BAC1] font-mono overflow-auto max-h-[260px] whitespace-pre-wrap leading-relaxed">
                {configTemplate}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

const ServiceCard: React.FC<{ service: AvailableService; onOpenDetails: (service: AvailableService) => void }> = ({
  service,
  onOpenDetails,
}) => {
  const { t } = useI18n();
  const title = service.serverName?.trim() || service.serviceType;
  const description = service.description?.trim();
  const icon = service.icon?.trim();
  const hasConfig = !!service.configTemplate?.trim();

  return (
    <button
      type="button"
      onClick={() => onOpenDetails(service)}
      className="group relative flex flex-col bg-[#2B2D31] hover:bg-[#32343a] rounded-lg overflow-hidden transition-all duration-200 border border-[#1E1F22] hover:border-[#4E5058] shadow-sm hover:shadow-md hover:-translate-y-0.5 text-left focus:outline-none focus:ring-2 focus:ring-[#5865F2]/60"
      aria-haspopup="dialog"
      aria-label={t('plugin.viewDetails', { title })}
    >
      {/* Main Body */}
      <div className="p-4 flex-1">
        <div className="flex items-start gap-3">
          <ServiceIcon icon={icon} title={title} />
          
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="text-[#F2F3F5] font-semibold text-base truncate max-w-full">
                {title}
              </h3>
              <PluginBadge />
            </div>
            <div className="text-xs text-[#949BA4] truncate font-mono mt-0.5">
              {service.serviceType}
            </div>
          </div>
        </div>

        <div className="mt-3">
          {description ? (
            <p className="text-sm text-[#B5BAC1] leading-relaxed line-clamp-2 min-h-[2.5em]">
              {description}
            </p>
          ) : (
            <p className="text-sm text-[#5C5E66] italic leading-relaxed select-none">
              {t('plugin.noDescription')}
            </p>
          )}
        </div>
      </div>

      {/* Footer Status Bar */}
      <div className="bg-[#232428] px-4 py-2.5 flex items-center justify-between border-t border-[#1E1F22]">
        <div className="flex items-center gap-4">
          {/* Status */}
          <div className="flex items-center gap-1.5" title={service.online ? t('plugin.serviceOnline') : t('plugin.serviceOffline')}>
            <div className={`w-2.5 h-2.5 rounded-full ${service.online ? 'bg-[#23A559] shadow-[0_0_4px_rgba(35,165,89,0.4)]' : 'bg-[#80848E]'}`} />
            <span className={`text-xs font-medium ${service.online ? 'text-[#F2F3F5]' : 'text-[#949BA4]'}`}>
              {service.online ? t('plugin.online') : t('plugin.offline')}
            </span>
          </div>

          {/* Connections */}
          <div className="flex items-center gap-1.5 text-[#949BA4]" title={t('plugin.activeConnections')}>
            <Icon icon="mdi:server-network" width="14" />
            <span className="text-xs font-medium">{service.connections}</span>
          </div>
        </div>

        {/* Config Indicator */}
        {hasConfig && (
          <div className="flex items-center gap-1 text-[#949BA4] bg-[#2B2D31] px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-[#1E1F22]" title={t('plugin.configTemplateAvailable')}>
            <Icon icon="mdi:file-cog" width="12" />
            <span>{t('plugin.config')}</span>
          </div>
        )}
      </div>
    </button>
  );
};

const EmptyState: React.FC = () => {
  const { t } = useI18n();
  return (
    <div className="bg-[#2B2D31] rounded-lg p-12 text-center border border-[#1E1F22] flex flex-col items-center justify-center animate-fade-in">
      <div className="w-20 h-20 bg-[#313338] rounded-full flex items-center justify-center mb-4 border border-[#1E1F22]">
        <Icon icon="mdi:puzzle-remove" className="text-[#80848E]" width="40" />
      </div>
      <h3 className="text-[#F2F3F5] text-lg font-bold mb-2">{t('plugin.emptyTitle')}</h3>
      <p className="text-[#949BA4] text-sm max-w-sm leading-relaxed">
        {t('plugin.emptyDesc')}
      </p>
    </div>
  );
};

export const BotServiceStatusPanel: React.FC<{
  title: string;
  subtitle?: string;
  className?: string;
}> = ({ title, subtitle, className }) => {
  const { t } = useI18n();
  const { data: services, isLoading } = useQuery({
    queryKey: ['availableServices'],
    queryFn: async () => {
      const res = await infraApi.availableServices();
      return (res.data?.services || []) as AvailableService[];
    },
  });

  const sorted = React.useMemo(() => {
    return (services || []).slice().sort((a, b) => {
      const aName = (a.serverName || a.serviceType || '').toLowerCase();
      const bName = (b.serverName || b.serviceType || '').toLowerCase();
      
      // Sort online first, then by name
      if (a.online !== b.online) return a.online ? -1 : 1;
      return aName.localeCompare(bName);
    });
  }, [services]);

  const [selectedService, setSelectedService] = React.useState<AvailableService | null>(null);
  const [isExpanded, setIsExpanded] = React.useState(false);
  const closeDetails = React.useCallback(() => setSelectedService(null), []);

  const initialCount = 4;
  const hasMore = sorted.length > initialCount;
  const visibleServices = isExpanded ? sorted : sorted.slice(0, initialCount);

  return (
    <div className={`w-full h-full ${className || ''}`.trim()}>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-[#F2F3F5] flex items-center gap-2">
          <Icon icon="mdi:toy-brick" className="text-[#5865F2]" />
          {title}
        </h2>
        {subtitle && <p className="text-[#949BA4] text-sm mt-1">{subtitle}</p>}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
             <div key={i} className="h-40 bg-[#2B2D31] rounded-lg animate-pulse border border-[#1E1F22]" />
          ))}
        </div>
      ) : !sorted || sorted.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
            {visibleServices.map((service) => (
              <ServiceCard
                key={`${service.serviceType}-${service.serverName}`}
                service={service}
                onOpenDetails={setSelectedService}
              />
            ))}
          </div>

          {hasMore && (
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="group mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-dashed border-[#4E5058] hover:border-[#B5BAC1] bg-[#2B2D31]/30 hover:bg-[#2B2D31] transition-all duration-200 focus:outline-none active:scale-[0.98]"
            >
              <span className="text-sm font-semibold text-[#949BA4] group-hover:text-[#F2F3F5] transition-colors">
                {isExpanded ? t('plugin.showLess') : t('plugin.showMore')}
              </span>
              <Icon 
                icon={isExpanded ? "mdi:chevron-up" : "mdi:chevron-down"} 
                className={`text-[#949BA4] group-hover:text-[#F2F3F5] transition-transform duration-200 ${
                  isExpanded ? 'group-hover:-translate-y-0.5' : 'group-hover:translate-y-0.5'
                }`}
                width="18" 
              />
            </button>
          )}
        </>
      )}

      {selectedService && <ServiceDetailsModal service={selectedService} onClose={closeDetails} />}
    </div>
  );
};

export const PluginManagementPanel: React.FC = () => {
  const { t } = useI18n();
  return <BotServiceStatusPanel title={t('settings.plugins')} subtitle={t('plugin.subtitle')} className="pb-10" />;
};
