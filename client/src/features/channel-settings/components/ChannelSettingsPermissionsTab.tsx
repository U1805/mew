import { Icon } from '@iconify/react';
import clsx from 'clsx';

import { CHANNEL_PERMS, type DisplayOverride, type PermissionState } from '../model/constants';

export const ChannelSettingsPermissionsTab: React.FC<{
  isLoading: boolean;
  displayOverrides: DisplayOverride[];
  selectedOverrideId: string | null;
  currentDisplayOverride: DisplayOverride | null;
  mobilePermissionEditOpen: boolean;
  setMobilePermissionEditOpen: (open: boolean) => void;
  onAddOverride: () => void;
  onOverrideClick: (overrideId: string) => void;
  onUpdatePermission: (permId: string, state: PermissionState) => void;
  onSave: () => void;
  isSaving: boolean;
}> = ({
  isLoading,
  displayOverrides,
  selectedOverrideId,
  currentDisplayOverride,
  mobilePermissionEditOpen,
  setMobilePermissionEditOpen,
  onAddOverride,
  onOverrideClick,
  onUpdatePermission,
  onSave,
  isSaving,
}) => {
  if (isLoading) {
    return <div className="flex h-full w-full items-center justify-center text-mew-textMuted">Loading permissions...</div>;
  }

  return (
    <>
      <div className="flex flex-col md:flex-row h-[calc(100%-60px)] animate-fade-in overflow-hidden relative">
        <div
          className={clsx(
            'w-full md:w-[220px] flex-shrink-0 flex flex-col md:pr-4 md:border-r border-[#3F4147] h-full p-4 md:p-0',
            mobilePermissionEditOpen ? 'hidden md:flex' : 'flex'
          )}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-mew-textMuted uppercase">Roles / Members</h3>
            <button onClick={onAddOverride} className="text-mew-textMuted hover:text-white">
              <Icon icon="mdi:plus" width="18" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-0.5">
            {displayOverrides.map((override) => (
              <div
                key={override.id}
                className={clsx(
                  'flex items-center px-2 py-2 md:py-1.5 rounded cursor-pointer mb-1',
                  selectedOverrideId === override.id
                    ? 'bg-[#404249] text-white'
                    : 'text-[#B5BAC1] bg-[#2B2D31] md:bg-transparent hover:bg-[#35373C]'
                )}
                onClick={() => onOverrideClick(override.id)}
              >
                {override.type === 'role' ? (
                  <div className="w-3 h-3 rounded-full mr-2 flex-shrink-0" style={{ backgroundColor: override.color || '#99AAB5' }} />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-gray-600 mr-2 flex-shrink-0 overflow-hidden">
                    {override.avatarUrl && <img src={override.avatarUrl} className="w-full h-full object-cover" />}
                  </div>
                )}
                <span className="text-sm font-medium truncate flex-1">{override.name}</span>
                <Icon icon="mdi:chevron-right" className="md:hidden text-mew-textMuted" width="16" />
              </div>
            ))}
          </div>
        </div>

        <div
          className={clsx(
            'flex-1 md:pl-6 flex flex-col overflow-hidden bg-[#313338] absolute inset-0 md:static z-20 md:z-auto',
            mobilePermissionEditOpen ? 'flex' : 'hidden md:flex'
          )}
        >
          {currentDisplayOverride ? (
            <div className="h-full flex flex-col">
              <div className="flex items-center mb-6 shrink-0 p-4 md:p-0">
                <button onClick={() => setMobilePermissionEditOpen(false)} className="md:hidden mr-2 text-mew-textMuted hover:text-white">
                  <Icon icon="mdi:arrow-left" width="24" />
                </button>
                <div>
                  <h2 className="text-lg font-bold text-white mb-1">Advanced Permissions</h2>
                  <p className="text-sm text-mew-textMuted leading-tight">
                    Override for <strong className="text-white">{currentDisplayOverride.name}</strong>
                  </p>
                </div>
              </div>

              <div className="flex-grow overflow-y-auto custom-scrollbar pb-10 pr-2 px-4 md:px-0">
                {CHANNEL_PERMS.map((group) => (
                  <div key={group.group} className="mb-6">
                    <h3 className="text-xs font-bold text-mew-textMuted uppercase mb-2 border-b border-[#3F4147] pb-1">
                      {group.group} Permissions
                    </h3>
                    <div className="space-y-0.5">
                      {group.perms.map((perm) => {
                        let state: PermissionState = 'inherit';
                        if (currentDisplayOverride.allow.has(perm.id)) {
                          state = 'allow';
                        } else if (currentDisplayOverride.deny.has(perm.id)) {
                          state = 'deny';
                        }

                        return (
                          <div key={perm.id} className="flex flex-col sm:flex-row sm:items-center justify-between py-3 sm:py-2 border-b border-[#3F4147]/30">
                            <span className="text-sm font-medium text-[#DBDEE1] mb-2 sm:mb-0">{perm.name}</span>
                            <div className="flex items-center space-x-2 sm:space-x-1 self-end sm:self-auto">
                              <div
                                className={clsx(
                                  'w-10 h-8 sm:w-8 flex items-center justify-center rounded cursor-pointer border',
                                  state === 'deny'
                                    ? 'bg-red-500 border-red-500 text-white'
                                    : 'border-[#4E5058] text-[#B5BAC1] hover:border-red-500'
                                )}
                                onClick={() => onUpdatePermission(perm.id, 'deny')}
                                title="Deny"
                              >
                                <Icon icon="mdi:close" width="20" />
                              </div>
                              <div
                                className={clsx(
                                  'w-10 h-8 sm:w-8 flex items-center justify-center rounded cursor-pointer border',
                                  state === 'inherit' ? 'bg-[#4E5058] border-[#4E5058] text-white' : 'border-[#4E5058] text-[#B5BAC1]'
                                )}
                                onClick={() => onUpdatePermission(perm.id, 'inherit')}
                                title="Inherit"
                              >
                                <span className="text-lg font-bold">/</span>
                              </div>
                              <div
                                className={clsx(
                                  'w-10 h-8 sm:w-8 flex items-center justify-center rounded cursor-pointer border',
                                  state === 'allow'
                                    ? 'bg-green-500 border-green-500 text-white'
                                    : 'border-[#4E5058] text-[#B5BAC1] hover:border-green-500'
                                )}
                                onClick={() => onUpdatePermission(perm.id, 'allow')}
                                title="Allow"
                              >
                                <Icon icon="mdi:check" width="20" />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-mew-textMuted p-4 text-center">
              Select a role or member to edit permissions.
            </div>
          )}
        </div>
      </div>

      <div className="flex-shrink-0 h-[60px] bg-[#2B2D31] -mx-0 md:-mx-10 mt-auto flex items-center px-4 md:px-10 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.1),0_-4px_6px_-2px_rgba(0,0,0,0.05)]">
        <button
          className="bg-mew-accent hover:bg-mew-accentHover text-white px-6 py-2 rounded-[3px] font-medium text-sm transition-colors w-full md:w-auto"
          onClick={onSave}
          disabled={isSaving}
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </>
  );
};
