import { useState, useEffect, useMemo } from 'react';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';

import { useModalStore, useUIStore } from '../../../shared/stores';
import { Role } from '../../../shared/types';
import { Permission } from '../../../shared/constants/permissions';
import { useRoles } from '../../../shared/hooks/useRoles';

const PERMISSION_GROUPS = [
  { group: 'General Server Permissions', perms: [
    { id: 'MANAGE_CHANNELS', name: 'Manage Channels', desc: 'Allows members to create, edit, or delete channels.' },
    { id: 'MANAGE_ROLES', name: 'Manage Roles', desc: 'Allows members to create new roles and edit/delete roles lower than their highest role.' },
    { id: 'MANAGE_SERVER', name: 'Manage Server', desc: "Allows members to change this server's name or move its region." },
  ]},
  { group: 'Membership Permissions', perms: [
    { id: 'CREATE_INSTANT_INVITE', name: 'Create Invite', desc: 'Allows members to invite new people to this server.' },
    { id: 'CHANGE_NICKNAME', name: 'Change Nickname', desc: 'Allows members to change their own nickname.' },
    { id: 'MANAGE_NICKNAMES', name: 'Manage Nicknames', desc: "Allows members to change other members' nicknames." },
    { id: 'KICK_MEMBERS', name: 'Kick Members', desc: 'Allows members to remove other members from this server.' },
    { id: 'BAN_MEMBERS', name: 'Ban Members', desc: 'Allows members to permanently ban other members from this server.' },
  ]},
  { group: 'Text Channel Permissions', perms: [
    { id: 'SEND_MESSAGES', name: 'Send Messages', desc: 'Allows members to send messages in text channels.' },
    { id: 'EMBED_LINKS', name: 'Embed Links', desc: 'Allows links that are pasted into the chat window to embed.' },
    { id: 'ATTACH_FILES', name: 'Attach Files', desc: 'Allows members to upload files or media in the chat.' },
    { id: 'ADD_REACTIONS', name: 'Add Reactions', desc: 'Allows members to add new emoji reactions to a message.' },
    { id: 'MENTION_EVERYONE', name: 'Mention @everyone', desc: 'Allows members to use @everyone or @here.' },
    { id: 'MANAGE_MESSAGES', name: 'Manage Messages', desc: 'Allows members to delete messages by other members or pin any message.' },
    { id: 'READ_MESSAGE_HISTORY', name: 'Read Message History', desc: 'Allows members to read previous messages sent in channels.' },
  ]},
];

const PRESET_COLORS = [
  '#99AAB5', '#1ABC9C', '#2ECC71', '#3498DB', '#9B59B6', '#E91E63', '#F1C40F', '#E67E22', '#E74C3C', '#95A5A6', '#607D8B'
];

export const ServerSettingsModal = () => {
  const { closeModal, modalData, openModal } = useModalStore();
  const { currentServerId } = useUIStore();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'overview' | 'roles' | 'emoji' | 'stickers'>('overview');
  const [name, setName] = useState('');

  const { data: serverRoles, isLoading: isLoadingRoles } = useRoles(currentServerId);

  const [localRoles, setLocalRoles] = useState<Role[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [roleTab, setRoleTab] = useState<'display' | 'permissions'>('display');
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (serverRoles) {
      setLocalRoles(JSON.parse(JSON.stringify(serverRoles))); // Deep copy to avoid mutating cached roles
      if (!selectedRoleId || !serverRoles.some(r => r._id === selectedRoleId)) {
        setSelectedRoleId(serverRoles.find(r => r.isDefault)?._id || serverRoles[0]?._id || null);
      }
    }
  }, [serverRoles]);

  useEffect(() => {
    if (modalData?.server) {
      setName(modalData.server.name || '');
    }
  }, [modalData]);

  useEffect(() => {
    const originalJson = JSON.stringify(serverRoles?.map(r => ({...r, _id: r._id.toString()})).sort((a, b) => a._id.localeCompare(b._id)));
    const localJson = JSON.stringify(localRoles?.map(r => ({...r, _id: r._id.toString()})).sort((a, b) => a._id.localeCompare(b._id)));
    setHasChanges(originalJson !== localJson);
  }, [localRoles, serverRoles]);

  const saveMutation = useMutation({
      mutationFn: async () => {
        if (!currentServerId) throw new Error("No server ID");

        const originalIds = new Set(serverRoles?.map(r => r._id));
        const localIds = new Set(localRoles.map(r => r._id));

        const createdRoles = localRoles.filter(r => !originalIds.has(r._id));
        const deletedRoles = serverRoles?.filter(r => !localIds.has(r._id)) || [];
        const updatedRoles = localRoles.filter(r => {
            const original = serverRoles?.find(o => o._id === r._id);
            return original && JSON.stringify(original) !== JSON.stringify(r);
        });

        for (const role of createdRoles) {
            await roleApi.create(currentServerId, { name: role.name, permissions: role.permissions || [], color: role.color || '#99AAB5'});
        }
        for (const role of deletedRoles) {
            await roleApi.delete(currentServerId, role._id);
        }
        for (const role of updatedRoles) {
            await roleApi.update(currentServerId, role._id, { name: role.name, permissions: role.permissions, color: role.color });
        }

        const positions = localRoles.filter(r => originalIds.has(r._id)).map((role, index) => ({ roleId: role._id, position: localRoles.length - index }));
        if (positions.length > 0) {
            await roleApi.updatePositions(currentServerId, positions);
        }
      },
      onSuccess: () => {
          toast.success("All role changes saved successfully!");
          queryClient.invalidateQueries({ queryKey:['roles', currentServerId] });
      },
      onError: (err: any) => {
          toast.error(err.response?.data?.message || "An error occurred while saving roles.");
      }
  })

  const selectedRole = useMemo(() => localRoles.find(r => r._id === selectedRoleId), [localRoles, selectedRoleId]);

  const handleResetChanges = () => {
      if (serverRoles) {
        setLocalRoles(JSON.parse(JSON.stringify(serverRoles)));
      }
  };

  const handleLocalRoleUpdate = (updates: Partial<Role>) => {
    if (!selectedRoleId) return;
    setLocalRoles(prev => prev.map(r => r._id === selectedRoleId ? { ...r, ...updates } : r));
  };

  const togglePermission = (permId: string) => {
    if (!selectedRole) return;
    const currentPerms = selectedRole.permissions || [];
    const pId = permId as Permission;
    const hasPerm = currentPerms.includes(pId);

    const newPerms = hasPerm ? currentPerms.filter(p => p !== pId) : [...currentPerms, pId];
    handleLocalRoleUpdate({ permissions: newPerms });
  };

  const handleCreateRole = () => {
    const newRole: Role = {
      _id: `new_${Date.now()}`,
      name: 'New Role',
      color: '#99AAB5',
      position: localRoles.length,
      permissions: [],
      isDefault: false,
      serverId: currentServerId!,
    };
    setLocalRoles(prev => [...prev, newRole]);
    setSelectedRoleId(newRole._id);
    setRoleTab('display');
  };

  const handleDeleteRole = () => {
    if (!selectedRole || selectedRole.isDefault) return;
    openModal('confirm', {
        title: `Delete Role '${selectedRole.name}'`,
        description: 'Are you sure you want to delete this role? This cannot be undone.',
        onConfirm: () => setLocalRoles(prev => prev.filter(r => r._id !== selectedRoleId))
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex bg-[#313338] animate-fade-in text-mew-text font-sans">
         <div className="w-[30%] min-w-[220px] bg-[#2B2D31] flex flex-col items-end pt-[60px] pb-4 px-2">
             <div className="w-[192px] px-1.5">
                <h2 className="text-xs font-bold text-mew-textMuted uppercase mb-3 px-2.5">Server Settings</h2>
                <SidebarItem label="Overview" isActive={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
                <SidebarItem label="Roles" isActive={activeTab === 'roles'} onClick={() => setActiveTab('roles')} />
                <SidebarItem label="Emoji" isActive={activeTab === 'emoji'} onClick={() => setActiveTab('emoji')} />
                <SidebarItem label="Stickers" isActive={activeTab === 'stickers'} onClick={() => setActiveTab('stickers')} />

                <div className="h-[1px] bg-mew-divider my-2 mx-2 opacity-50"></div>

                <div
                    className="px-2.5 py-1.5 rounded-[4px] text-mew-textMuted hover:bg-[#35373C] font-medium text-sm cursor-pointer mb-0.5 flex justify-between group text-red-400"
                    onClick={() => openModal('deleteServer', { server: modalData.server })}
                >
                    <span>Delete Server</span>
                    <Icon icon="mdi:trash-can-outline" />
                </div>
             </div>
         </div>

         <div className="flex-1 bg-[#313338] pt-[60px] px-10 max-w-[800px] overflow-hidden flex flex-col h-full">
             {activeTab === 'overview' && (
               <div className="animate-fade-in overflow-y-auto custom-scrollbar h-full pb-10">
                 <h2 className="text-xl font-bold text-white mb-6">Server Overview</h2>
                 <div className="flex gap-8">
                     <div className="flex items-center justify-center">
                         <div className="w-[100px] h-[100px] rounded-full bg-mew-accent flex items-center justify-center relative group cursor-pointer">
                             <div className="text-white text-3xl font-bold">{modalData?.server?.name?.substring(0,2).toUpperCase()}</div>
                             <div className="absolute top-0 right-0 bg-white rounded-full p-1 shadow-md">
                                 <Icon icon="mdi:image-plus" className="text-black" width="16" />
                             </div>
                             <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs font-bold text-white uppercase">
                                 Change Icon
                             </div>
                         </div>
                     </div>
                     <div className="flex-1 space-y-4">
                         <div>
                            <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">Server Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full bg-[#1E1F22] text-white p-2.5 rounded border-none focus:outline-none focus:ring-0 font-medium"
                            />
                         </div>
                         <div className="flex gap-4">
                             <button className="bg-mew-accent hover:bg-mew-accentHover text-white px-6 py-2 rounded-[3px] font-medium text-sm transition-colors">Save Changes</button>
                             <button onClick={closeModal} className="text-white hover:underline text-sm font-medium px-2 self-center">Cancel</button>
                         </div>
                     </div>
                 </div>
               </div>
             )}

             {activeTab === 'roles' && (
                <div className="flex h-full animate-fade-in relative">
                  <div className="w-[200px] flex-shrink-0 flex flex-col pr-4 border-r border-[#3F4147] h-full">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xs font-bold text-mew-textMuted uppercase">Roles</h3>
                      <button onClick={handleCreateRole} className="text-mew-textMuted hover:text-white">
                        <Icon icon="mdi:plus" width="18" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-0.5">
                    {isLoadingRoles && <p className='text-center text-sm'>Loading Roles...</p>}
                      {[...localRoles].sort((a,b) => b.position - a.position).map(role => (
                        <div
                          key={role._id}
                          className={clsx(
                            "flex items-center px-2 py-1.5 rounded cursor-pointer group mb-1",
                            selectedRoleId === role._id ? "bg-[#404249]" : "hover:bg-[#35373C]"
                          )}
                          onClick={() => setSelectedRoleId(role._id)}
                        >
                          <div className="w-3 h-3 rounded-full mr-2 flex-shrink-0" style={{ backgroundColor: role.color }}></div>
                          <span className={clsx("text-sm font-medium truncate flex-1", selectedRoleId === role._id ? "text-white" : "text-[#B5BAC1]")}>
                            {role.name}
                          </span>
                          <Icon icon="mdi:drag" className="text-mew-textMuted opacity-0 group-hover:opacity-100 cursor-grab" width="16" />
                        </div>
                      ))}
                    </div>
                  </div>

                  {selectedRole ? (
                  <div className="flex-1 pl-6 flex flex-col overflow-hidden">
                     <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#3F4147]">
                       <h2 className="text-lg font-bold text-white">Edit Role — {selectedRole.name}</h2>
                       <div className="flex bg-[#1E1F22] rounded-[3px] p-0.5">
                          <button
                             className={clsx("px-4 py-1 rounded-[2px] text-sm font-medium transition-colors", roleTab === 'display' ? "bg-[#404249] text-white" : "text-mew-textMuted hover:text-mew-text")}
                             onClick={() => setRoleTab('display')}
                          >
                            Display
                          </button>
                          <button
                             className={clsx("px-4 py-1 rounded-[2px] text-sm font-medium transition-colors", roleTab === 'permissions' ? "bg-[#404249] text-white" : "text-mew-textMuted hover:text-mew-text")}
                             onClick={() => setRoleTab('permissions')}
                          >
                            Permissions
                          </button>
                       </div>
                     </div>

                     <div className="flex-1 overflow-y-auto custom-scrollbar pb-24">
                        {roleTab === 'display' && (
                          <div className="space-y-6 animate-fade-in">
                            <div>
                               <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">Role Name</label>
                               <input type="text" value={selectedRole.name} onChange={(e) => handleLocalRoleUpdate({ name: e.target.value })} disabled={selectedRole.isDefault} className={clsx("w-full bg-[#1E1F22] text-white p-2.5 rounded border-none focus:outline-none focus:ring-0 font-medium", selectedRole.isDefault && "opacity-50 cursor-not-allowed")} />
                            </div>

                            <div>
                               <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">Role Color</label>
                               <div className="grid grid-cols-6 gap-2 mb-3">
                                  {PRESET_COLORS.map(color => (
                                     <div key={color} className={clsx("w-full pt-[100%] rounded cursor-pointer relative", selectedRole.color === color && "ring-2 ring-white ring-offset-2 ring-offset-[#313338]")} style={{ backgroundColor: color }} onClick={() => handleLocalRoleUpdate({ color })} ></div>
                                  ))}
                               </div>
                            </div>
                            {!selectedRole.isDefault && (<div>
                               <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">Manage</label>
                                <button onClick={handleDeleteRole} className='text-sm text-red-400 hover:underline'>Delete Role</button>
                            </div>)}
                          </div>
                        )}

                        {roleTab === 'permissions' && (
                          <div className="space-y-8 animate-fade-in">
                            <div className="text-sm text-mew-textMuted bg-[#404249] p-3 rounded flex items-start">
                              <Icon icon="mdi:information-outline" className="mr-2 mt-0.5 flex-shrink-0" width="18" />
                              <span>Roles allow you to group server members and assign permissions to them. <strong>@everyone</strong> applies to all members who don&apos;t have a specific role assignment.</span>
                            </div>

                            {PERMISSION_GROUPS.map(group => (
                              <div key={group.group}>
                                <h3 className="text-xs font-bold text-mew-textMuted uppercase mb-4">{group.group}</h3>
                                <div className="space-y-4">
                                  {group.perms.map(perm => {
                                    const isEnabled = selectedRole.permissions?.includes(perm.id as Permission);
                                    const isDisabled = selectedRole.isDefault && (perm.id === 'ADMINISTRATOR' || perm.id === 'KICK_MEMBERS' || perm.id === 'BAN_MEMBERS');
                                    return (
                                      <div key={perm.id} className={clsx("flex items-center justify-between", isDisabled && 'opacity-50')}>
                                        <div className="mr-4">
                                          <div className="font-medium text-white text-base">{perm.name}</div>
                                          <div className="text-xs text-[#B5BAC1]">{perm.desc}</div>
                                        </div>

                                        <div onClick={() => !isDisabled && togglePermission(perm.id)} className={clsx("w-10 h-6 rounded-full p-1 transition-colors flex-shrink-0 relative", isEnabled ? "bg-green-500" : "bg-[#80848E]", isDisabled ? 'cursor-not-allowed' : 'cursor-pointer' )}>
                                          <div className={clsx("w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200", isEnabled ? "translate-x-4" : "translate-x-0" )}></div>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                                <div className="h-[1px] bg-[#3F4147] mt-4 opacity-50"></div>
                              </div>
                            ))}
                          </div>
                        )}
                     </div>
                  </div>
                  ) : (
                      <div className='flex-1 flex items-center justify-center text-mew-textMuted'>Select a role to start editing its permissions.</div>
                  )}

                  {hasChanges && (
                    <div className="absolute bottom-4 left-4 right-4 bg-[#1E1F22] p-2 rounded-md shadow-lg flex items-center justify-between animate-fade-in-up">
                        <span className="text-sm text-mew-textMuted">You have unsaved changes!</span>
                        <div>
                            <button onClick={handleResetChanges} className="text-white hover:underline text-sm font-medium px-4 py-2">Reset</button>
                            <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="bg-green-500 hover:bg-green-600 text-white rounded px-4 py-2 text-sm font-medium">
                                {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                )}
                </div>
             )}

             {(activeTab === 'emoji' || activeTab === 'stickers') && (
                <div className="flex flex-col items-center justify-center h-full text-mew-textMuted">
                    <Icon icon="mdi:hammer-wrench" width="48" className="mb-2 opacity-50" />
                    <p>This setting is coming soon.</p>
                </div>
             )}
         </div>

         <div className="w-[18%] min-w-[60px] pt-[60px] pl-5">
             <div className="flex flex-col items-center cursor-pointer group" onClick={closeModal}>
                 <div className="w-9 h-9 rounded-full border-[2px] border-mew-textMuted group-hover:bg-mew-textMuted/20 flex items-center justify-center transition-colors mb-1">
                     <Icon icon="mdi:close" className="text-mew-textMuted group-hover:text-white" width="24" height="24" />
                 </div>
                 <span className="text-xs font-bold text-mew-textMuted group-hover:text-white transition-colors">ESC</span>
             </div>
         </div>
    </div>
  )
}

const SidebarItem = ({ label, isActive, onClick }: { label: string; isActive?: boolean; onClick: () => void }) => {
    return (
        <div
            onClick={onClick}
            className={clsx(
            "px-2.5 py-1.5 rounded-[4px] cursor-pointer mb-0.5 font-medium text-sm transition-colors",
            isActive
                ? "bg-[#404249] text-white"
                : "text-mew-textMuted hover:bg-[#35373C] hover:text-mew-text"
        )}>
            {label}
        </div>
    )
}
