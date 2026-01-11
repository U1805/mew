import { useState, useEffect, useMemo } from 'react';
import { useModalStore, useUIStore } from '../../../shared/stores';
import { channelApi } from '../../../shared/services/api';
import { PermissionOverride } from '../../../shared/types';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { usePermissions } from '../../../shared/hooks/usePermissions';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useMembers } from '../../../shared/hooks/useMembers';
import { useRoles } from '../../../shared/hooks/useRoles';
import { useCategories } from '../hooks/useCategories';
import { usePermissionOverrides } from '../hooks/usePermissionOverrides';
import { ChannelSettingsSidebar, type ChannelSettingsTab } from '../../channel-settings/components/ChannelSettingsSidebar';
import { ChannelSettingsOverviewTab } from '../../channel-settings/components/ChannelSettingsOverviewTab';
import { ChannelSettingsIntegrationsTab } from '../../channel-settings/components/ChannelSettingsIntegrationsTab';
import { makeEmptyOverride, type DisplayOverride, type PermissionState } from '../../channel-settings/model/constants';
import { ChannelSettingsPermissionsTab } from '../../channel-settings/components/ChannelSettingsPermissionsTab';

export const ChannelSettingsModal = () => {
  const { closeModal, modalData, openModal } = useModalStore();
  const { currentServerId } = useUIStore();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [topic, setTopic] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<ChannelSettingsTab>('overview');
  
  // Mobile Nav States
  const [mobileMenuOpen, setMobileMenuOpen] = useState(true);
  const [mobilePermissionEditOpen, setMobilePermissionEditOpen] = useState(false);

  const permissions = usePermissions(modalData?.channel?._id);

  const [selectedOverrideId, setSelectedOverrideId] = useState<string | null>(null);
  const [localOverrides, setLocalOverrides] = useState<PermissionOverride[]>([]);

  const channelId = modalData?.channel?._id;

  const { data: serverRoles } = useRoles(currentServerId);
  const { data: serverMembers } = useMembers(currentServerId);
  const { data: initialOverrides, isLoading: isLoadingOverrides } = usePermissionOverrides(currentServerId, channelId);

  const updatePermissionsMutation = useMutation({
      mutationFn: (overrides: PermissionOverride[]) =>
          channelApi.updatePermissionOverrides(currentServerId!, channelId!, overrides),
      onSuccess: () => {
          toast.success('Permissions updated!');
          queryClient.invalidateQueries({ queryKey: ['permissionOverrides', channelId] });
      },
      onError: (err: any) => {
          toast.error(err.response?.data?.message || 'Failed to update permissions.');
      }
  });

  useEffect(() => {
    if (initialOverrides) {
      setLocalOverrides(initialOverrides);
      const everyoneRole = serverRoles?.find(r => r.isDefault);
      // Auto-select on desktop, wait for user interaction on mobile
      if (!mobilePermissionEditOpen) {
          if (everyoneRole && !selectedOverrideId) {
            const everyoneOverride = initialOverrides.find(o => o.targetType === 'role' && o.targetId === everyoneRole._id);
            setSelectedOverrideId(everyoneOverride ? `role-${everyoneRole._id}` : `role-${everyoneRole._id}-new`);
          } else if (initialOverrides.length > 0 && !selectedOverrideId) {
              const first = initialOverrides[0];
              setSelectedOverrideId(`${first.targetType}-${first.targetId}`);
          }
      }
    }
  }, [initialOverrides, serverRoles, selectedOverrideId, mobilePermissionEditOpen]);

  useEffect(() => {
    if (modalData?.channel) {
      setName(modalData.channel.name || '');
      setCategoryId(modalData.channel.categoryId || '');
      setTopic(modalData.channel.topic || '');
    }
  }, [modalData]);

  const { data: categories } = useCategories(currentServerId);

  const handleChannelUpdate = async () => {
      if (!currentServerId || !modalData?.channel) return;
      setIsLoading(true);
      try {
          const catId = categoryId === '' ? null : categoryId;
          await channelApi.update(currentServerId, modalData.channel._id, {
              name,
              categoryId: catId,
              topic,
          });
          queryClient.invalidateQueries({ queryKey: ['channels', currentServerId] });
          queryClient.invalidateQueries({ queryKey: ['channel', modalData.channel._id] });
          closeModal();
      } catch (error) {
          console.error(error);
      } finally {
          setIsLoading(false);
      }
  };

  const handleSelectNewTarget = (target: { targetId: string, targetType: 'role' | 'member' }) => {
    if (localOverrides.some(o => o.targetId === target.targetId)) return;
    const newOverride: PermissionOverride = makeEmptyOverride(target);
    setLocalOverrides(prev => [...prev, newOverride]);
    const newId = `${target.targetType}-${target.targetId}`;
    setSelectedOverrideId(newId);
    setMobilePermissionEditOpen(true);
  };

  const handleAddOverride = () => {
      if (!serverRoles || !serverMembers) return;
      const existingTargetIds = localOverrides.map(o => o.targetId);
      openModal('addPermissionOverride', {
          roles: serverRoles,
          members: serverMembers,
          existingTargetIds: existingTargetIds,
          onSelect: handleSelectNewTarget,
      });
  };

  const handleUpdatePermission = (permId: string, state: PermissionState) => {
    if (!currentDisplayOverride) return;
    const { targetId, type } = currentDisplayOverride;
    setLocalOverrides(prev => {
        const newOverrides = [...prev];
        let override = newOverrides.find(o => o.targetId === targetId);
        if (!override) {
            override = { targetId, targetType: type, allow: [], deny: [] };
            newOverrides.push(override);
        }
        override.allow = override.allow.filter(p => p !== permId);
        override.deny = override.deny.filter(p => p !== permId);
        if (state === 'allow') {
            override.allow.push(permId);
        } else if (state === 'deny') {
            override.deny.push(permId);
        }
        return newOverrides.filter(o => o.allow.length > 0 || o.deny.length > 0);
    });
  };

 const handleSave = () => {
      const cleanedOverrides = localOverrides.map(({ allow, deny, ...rest }) => ({
          ...rest,
          allow: Array.from(new Set(allow)),
          deny: Array.from(new Set(deny)),
      }));
      updatePermissionsMutation.mutate(cleanedOverrides);
  }

  const { displayOverrides, currentDisplayOverride } = useMemo(() => {
    if (!serverRoles || !serverMembers) return { displayOverrides: [], currentDisplayOverride: null };

    const allPossibleTargets = [
      ...serverRoles.map(r => ({ id: r._id, name: r.name, color: r.color, type: 'role' as const, isDefault: r.isDefault })),
      ...serverMembers.map(m => ({ id: m.userId._id, name: m.userId.username, avatarUrl: m.userId.avatarUrl, type: 'member' as const }))
    ];

    const existingOverrideTargetIds = new Set(localOverrides.map(o => o.targetId));

    const everyoneRole = serverRoles.find(r => r.isDefault);
    if (everyoneRole && !existingOverrideTargetIds.has(everyoneRole._id)) {
        existingOverrideTargetIds.add(everyoneRole._id);
    }

    const overridesForDisplay = Array.from(existingOverrideTargetIds).map(targetId => {
        const override = localOverrides.find(o => o.targetId === targetId);
        const targetInfo = allPossibleTargets.find(t => t.id === targetId);
        if (!targetInfo) return null;
        return {
            id: `${targetInfo.type}-${targetInfo.id}`,
            targetId: targetInfo.id,
            name: targetInfo.name,
            color: targetInfo.type === 'role' ? targetInfo.color : undefined,
            avatarUrl: targetInfo.type === 'member' ? targetInfo.avatarUrl : undefined,
            type: targetInfo.type,
            allow: new Set(override?.allow || []),
            deny: new Set(override?.deny || []),
        };
    }).filter(Boolean) as DisplayOverride[];

    overridesForDisplay.sort((a, b) => {
        const aIsEveryone = serverRoles.find(r => r._id === a.targetId)?.isDefault;
        const bIsEveryone = serverRoles.find(r => r._id === b.targetId)?.isDefault;
        if (aIsEveryone) return -1;
        if (bIsEveryone) return 1;
        if (a.type === 'role' && b.type === 'member') return -1;
        if (a.type === 'member' && b.type === 'role') return 1;
        return a.name.localeCompare(b.name);
    });

    const current = overridesForDisplay.find(o => o.id === selectedOverrideId);

    return { displayOverrides: overridesForDisplay, currentDisplayOverride: current || null };

  }, [localOverrides, serverRoles, serverMembers, selectedOverrideId]);

  const handleTabClick = (tab: typeof activeTab) => {
      setActiveTab(tab);
      setMobileMenuOpen(false);
  }

  const handleOverrideClick = (overrideId: string) => {
      setSelectedOverrideId(overrideId);
      setMobilePermissionEditOpen(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col md:flex-row bg-[#313338] animate-fade-in text-mew-text font-sans">
         
         {/* Sidebar (Left) */}
         <ChannelSettingsSidebar
             title={<>{modalData?.channel?.name || 'CHANNEL'} TEXT CHANNELS</>}
             activeTab={activeTab}
             mobileMenuOpen={mobileMenuOpen}
             onClose={closeModal}
             onTabClick={handleTabClick}
             onDelete={() => openModal('deleteChannel', modalData)}
             showIntegrations={permissions.has('MANAGE_WEBHOOKS')}
         />

         {/* Content Area (Right) */}
         <div className={clsx(
             "flex-1 bg-[#313338] pt-0 md:pt-[60px] px-0 md:px-10 max-w-full md:max-w-[800px] overflow-hidden flex flex-col h-full",
             !mobileMenuOpen ? "flex" : "hidden md:flex"
         )}>
             
             {/* Mobile Content Header */}
             <div className="md:hidden h-14 flex items-center px-4 bg-[#313338] border-b border-[#26272D] sticky top-0 z-20 shrink-0">
                <button 
                    onClick={() => setMobileMenuOpen(true)}
                    className="mr-4 text-mew-textMuted hover:text-white"
                >
                    <Icon icon="mdi:arrow-left" width="24" />
                </button>
                <span className="font-bold text-lg text-white capitalize">
                    {activeTab}
                </span>
            </div>

             {/* OVERVIEW */}
             {activeTab === 'overview' && (
                 <ChannelSettingsOverviewTab
                     name={name}
                     onNameChange={setName}
                     categoryId={categoryId}
                     onCategoryChange={setCategoryId}
                     categories={categories}
                     topic={topic}
                     onTopicChange={setTopic}
                     isSaving={isLoading}
                     onSave={handleChannelUpdate}
                     onCancel={closeModal}
                 />
             )}

              {/* PERMISSIONS */}
              {activeTab === 'permissions' && (
                 <ChannelSettingsPermissionsTab
                   isLoading={isLoadingOverrides}
                   displayOverrides={displayOverrides}
                   selectedOverrideId={selectedOverrideId}
                   currentDisplayOverride={currentDisplayOverride}
                   mobilePermissionEditOpen={mobilePermissionEditOpen}
                   setMobilePermissionEditOpen={setMobilePermissionEditOpen}
                   onAddOverride={handleAddOverride}
                   onOverrideClick={handleOverrideClick}
                   onUpdatePermission={handleUpdatePermission}
                   onSave={handleSave}
                   isSaving={updatePermissionsMutation.isPending}
                 />
              )}

              {/* INTEGRATIONS */}
              {activeTab === 'integrations' && permissions.has('MANAGE_WEBHOOKS') && (
                  <ChannelSettingsIntegrationsTab serverId={currentServerId!} channel={modalData.channel} />
              )}
          </div>

         {/* Close (Desktop) */}
         <div className="hidden md:block w-[18%] min-w-[60px] pt-[60px] pl-5">
             <div className="flex flex-col items-center cursor-pointer group" onClick={closeModal}>
                 <div className="w-9 h-9 rounded-full border-[2px] border-mew-textMuted group-hover:bg-mew-textMuted/20 flex items-center justify-center transition-colors mb-1">
                     <Icon icon="mdi:close" className="text-mew-textMuted group-hover:text-white" width="24" height="24" />
                 </div>
                 <span className="text-xs font-bold text-mew-textMuted group-hover:text-white transition-colors">ESC</span>
             </div>
         </div>
    </div>
  );
};
