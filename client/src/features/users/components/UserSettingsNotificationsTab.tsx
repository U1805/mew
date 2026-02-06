import React from 'react';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import type { UserNotificationSettings } from '../../../shared/types';
import { playMessageSound, requestDesktopNotificationPermission, showDesktopNotification } from '../../../shared/services/notifications';
import { Switch } from './UserSettingsSwitch';
import { useI18n } from '../../../shared/i18n';

export const UserSettingsNotificationsTab: React.FC<{
  notif: UserNotificationSettings;
  isUpdatingNotifications: boolean;
  setNotif: (next: Partial<UserNotificationSettings>) => void;
  persistNotificationSettings: (next: Partial<UserNotificationSettings>) => Promise<void>;
}> = ({ notif, isUpdatingNotifications, setNotif, persistNotificationSettings }) => {
  const { t } = useI18n();

  return (
    <div className="animate-in fade-in duration-300">
      <h2 className="text-[20px] font-bold text-[#F2F3F5] mb-5 hidden md:block">{t('settings.notifications')}</h2>

      <div className="space-y-6">
        <div>
          <h3 className="text-xs font-bold text-[#B5BAC1] uppercase mb-3 tracking-wide">{t('notifications.sounds')}</h3>

          <div className="space-y-1">
            <div
              className="flex items-center justify-between py-2 cursor-pointer group hover:bg-[#3F4147]/30 rounded px-1 -mx-1 transition-colors"
              onClick={async () => {
                if (isUpdatingNotifications) return;
                const newState = !notif.soundEnabled;
                await persistNotificationSettings({ soundEnabled: newState });
                if (newState) playMessageSound(notif.soundVolume);
              }}
            >
              <div className="flex-1 pr-4">
                <div className="text-[#F2F3F5] font-medium text-base mb-0.5 group-hover:underline decoration-1 underline-offset-2 decoration-[#F2F3F5]/0 group-hover:decoration-[#F2F3F5]/100 transition-all">
                  {t('notifications.messageSounds')}
                </div>
                <div className="text-sm text-[#B5BAC1]">{t('notifications.messageSoundsDesc')}</div>
              </div>
              <Switch
                checked={notif.soundEnabled}
                disabled={isUpdatingNotifications}
                onChange={async () => {
                  const newState = !notif.soundEnabled;
                  await persistNotificationSettings({ soundEnabled: newState });
                  if (newState) playMessageSound(notif.soundVolume);
                }}
              />
            </div>

            <div className="h-[1px] bg-[#3F4147] my-4 w-full" />

            <div className={clsx('py-2 transition-opacity duration-300', !notif.soundEnabled && 'opacity-50 pointer-events-none grayscale')}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-[#F2F3F5] font-medium text-base mb-0.5">{t('notifications.soundVolume')}</div>
                  <div className="text-sm text-[#B5BAC1]">{t('notifications.soundVolumeDesc')}</div>
                </div>
              </div>

              <div className="flex items-center gap-4 pl-1">
                <Icon icon="mdi:volume-high" className="text-[#B5BAC1]" width="24" />

                <div className="relative w-full h-10 flex items-center group">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(notif.soundVolume * 100)}
                    disabled={!notif.soundEnabled || isUpdatingNotifications}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(100, Number(e.target.value)));
                      setNotif({ soundVolume: v / 100 });
                    }}
                    onMouseUp={async (e: any) => {
                      const v = Math.max(0, Math.min(100, Number(e.currentTarget.value)));
                      await persistNotificationSettings({ soundVolume: v / 100 });
                      playMessageSound(v / 100);
                    }}
                    onTouchEnd={async (e: any) => {
                      const v = Math.max(0, Math.min(100, Number(e.currentTarget.value)));
                      await persistNotificationSettings({ soundVolume: v / 100 });
                      playMessageSound(v / 100);
                    }}
                    className={clsx(
                      'w-full h-[8px] rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-0',
                      '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[10px] [&::-webkit-slider-thumb]:h-[24px] [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-[3px] [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:border-0',
                      '[&::-moz-range-thumb]:w-[10px] [&::-moz-range-thumb]:h-[24px] [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:rounded-[3px] [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-grab'
                    )}
                    style={{
                      background: `linear-gradient(to right, #5865F2 0%, #5865F2 ${notif.soundVolume * 100}%, #4E5058 ${notif.soundVolume * 100}%, #4E5058 100%)`,
                    }}
                  />
                </div>

                <div className="w-10 text-right text-sm font-medium text-[#F2F3F5] tabular-nums">{Math.round(notif.soundVolume * 100)}%</div>
              </div>
            </div>
          </div>
        </div>

        <div className="h-[1px] bg-[#3F4147] w-full" />

        <div>
          <h3 className="text-xs font-bold text-[#B5BAC1] uppercase mb-3 tracking-wide">{t('notifications.desktopOptions')}</h3>

          <div className="space-y-4">
            <div
              className="flex items-center justify-between py-2 cursor-pointer group hover:bg-[#3F4147]/30 rounded px-1 -mx-1 transition-colors"
              onClick={async () => {
                if (notif.desktopEnabled) {
                  await persistNotificationSettings({ desktopEnabled: false });
                  return;
                }
                const perm = await requestDesktopNotificationPermission();
                if (perm !== 'granted') {
                  toast.error(t('notifications.permissionDenied'));
                  await persistNotificationSettings({ desktopEnabled: false });
                  return;
                }
                await persistNotificationSettings({ desktopEnabled: true });
                showDesktopNotification({
                  title: t('notifications.enabledTitle'),
                  body: t('notifications.enabledBody'),
                  tag: 'mew:enabled',
                });
              }}
            >
              <div className="flex-1 pr-4">
                <div className="text-[#F2F3F5] font-medium text-base mb-0.5 group-hover:underline decoration-1 underline-offset-2 decoration-[#F2F3F5]/0 group-hover:decoration-[#F2F3F5]/100 transition-all">
                  {t('notifications.enableDesktop')}
                </div>
                <div className="text-sm text-[#B5BAC1]">{t('notifications.enableDesktopDesc')}</div>
              </div>
              <Switch
                checked={notif.desktopEnabled}
                disabled={isUpdatingNotifications}
                onChange={async () => {
                  // Logic handled in wrapper div.
                }}
              />
            </div>

            <div className="flex justify-start pt-1">
              <button
                disabled={!notif.desktopEnabled || typeof Notification === 'undefined' || Notification.permission !== 'granted'}
                onClick={() => {
                  if (notif.soundEnabled) playMessageSound(notif.soundVolume);
                  showDesktopNotification({
                    title: t('notifications.testTitle'),
                    body: t('notifications.testBody'),
                    tag: 'mew:test',
                    data: { channelId: null },
                  });
                }}
                className={clsx(
                  'flex items-center gap-2 px-4 h-[34px] rounded-[3px] text-sm font-medium transition-all duration-200',
                  notif.desktopEnabled && typeof Notification !== 'undefined' && Notification.permission === 'granted'
                    ? 'bg-[#4E5058] text-white hover:bg-[#6D6F78] active:bg-[#80848E]'
                    : 'bg-[#4E5058]/50 text-[#949BA4] cursor-not-allowed opacity-60'
                )}
              >
                <Icon icon="mdi:bell-outline" width="16" />
                {t('notifications.sendTest')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
