import { useState, useEffect, useMemo, useRef } from 'react';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';

import { useModalStore, useUIStore } from '../../../shared/stores';
import { Role, Sticker } from '../../../shared/types';
import { Permission } from '../../../shared/constants/permissions';
import { useRoles } from '../../../shared/hooks/useRoles';
import { roleApi, serverApi, stickerApi } from '../../../shared/services/api';
import { useServerPermissions } from '../../../shared/hooks/useServerPermissions';

const PERMISSION_GROUPS = [
  { group: 'General Server Permissions', perms: [
    { id: 'ADMINISTRATOR', name: 'Administrator', desc: 'Grants all permissions and bypasses all permission checks.' },
    { id: 'MANAGE_CHANNEL', name: 'Manage Channels', desc: 'Allows members to create, edit, or delete channels.' },
    { id: 'MANAGE_ROLES', name: 'Manage Roles', desc: 'Allows members to create new roles and edit/delete roles lower than their highest role.' },
    { id: 'MANAGE_SERVER', name: 'Manage Server', desc: "Allows members to change this server's name or move its region." },
    { id: 'MANAGE_STICKERS', name: 'Manage Stickers', desc: 'Allows members to upload, edit, or delete stickers in this server.' },
  ]},
  { group: 'Membership Permissions', perms: [
    { id: 'CREATE_INVITE', name: 'Create Invite', desc: 'Allows members to invite new people to this server.' },
    { id: 'CHANGE_NICKNAME', name: 'Change Nickname', desc: 'Allows members to change their own nickname.' },
    { id: 'MANAGE_NICKNAMES', name: 'Manage Nicknames', desc: "Allows members to change other members' nicknames." },
    { id: 'KICK_MEMBERS', name: 'Kick Members', desc: 'Allows members to remove other members from this server.' },
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
  const { closeModal, openModal } = useModalStore();
  const { currentServerId } = useUIStore();
  const queryClient = useQueryClient();
  const { permissions: serverPermissions } = useServerPermissions();
  const canManageStickers = serverPermissions.has('ADMINISTRATOR') || serverPermissions.has('MANAGE_STICKERS');

  const [activeTab, setActiveTab] = useState<'overview' | 'roles' | 'emoji' | 'stickers'>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(true);
  const [mobileRoleEditOpen, setMobileRoleEditOpen] = useState(false);

  const [name, setName] = useState('');

  // Sticker State
  const [newStickerFile, setNewStickerFile] = useState<File | null>(null);
  const [newStickerName, setNewStickerName] = useState('');
  const [newStickerTags, setNewStickerTags] = useState('');
  const [newStickerPreview, setNewStickerPreview] = useState<string | null>(null); // Added preview state
  const [stickerDrafts, setStickerDrafts] = useState<Record<string, { name: string; tags: string; description: string }>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const stickerInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingIconFile, setPendingIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);

  const { data: server } = useQuery({
    queryKey: ['server', currentServerId],
    queryFn: () => serverApi.get(currentServerId!).then((res) => res.data),
    enabled: !!currentServerId,
  });

  const { data: stickers, isLoading: isLoadingStickers } = useQuery({
    queryKey: ['stickers', currentServerId],
    queryFn: () => stickerApi.list(currentServerId!).then((res) => res.data as Sticker[]),
    enabled: !!currentServerId && activeTab === 'stickers',
  });

  const { data: serverRoles, isLoading: isLoadingRoles } = useRoles(currentServerId);

  const [localRoles, setLocalRoles] = useState<Role[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [roleTab, setRoleTab] = useState<'display' | 'permissions'>('display');
  const [hasChanges, setHasChanges] = useState(false);
  const [hasOverviewChanges, setHasOverviewChanges] = useState(false);
  const [draggedRoleId, setDraggedRoleId] = useState<string | null>(null);
  const [dragOverRoleId, setDragOverRoleId] = useState<string | null>(null);

  useEffect(() => {
    if (serverRoles) {
      setLocalRoles(JSON.parse(JSON.stringify(serverRoles))); 
      if (!selectedRoleId || !serverRoles.some(r => r._id === selectedRoleId)) {
        setSelectedRoleId(serverRoles.find(r => r.isDefault)?._id || serverRoles[0]?._id || null);
      }
    }
  }, [serverRoles]);

  useEffect(() => {
    if (server) {
      setName(server.name || '');
      setIconPreview(server.avatarUrl || null);
    }
  }, [server]);

  useEffect(() => {
    if (!Array.isArray(stickers)) return;
    setStickerDrafts((prev) => {
      const next = { ...prev };
      for (const s of stickers) {
        if (!next[s._id]) {
          next[s._id] = {
            name: s.name || '',
            tags: Array.isArray(s.tags) ? s.tags.join(' ') : '',
            description: s.description || '',
          };
        }
      }
      return next;
    });
  }, [stickers]);

  useEffect(() => {
    const originalJson = JSON.stringify(serverRoles?.map(r => ({...r, _id: r._id.toString()})).sort((a, b) => a._id.localeCompare(b._id)));
    const localJson = JSON.stringify(localRoles?.map(r => ({...r, _id: r._id.toString()})).sort((a, b) => a._id.localeCompare(b._id)));
    setHasChanges(originalJson !== localJson);
  }, [localRoles, serverRoles]);

  useEffect(() => {
    if (server) {
      const nameChanged = name !== server.name;
      const iconChanged = !!pendingIconFile;
      setHasOverviewChanges(nameChanged || iconChanged);
    }
  }, [name, pendingIconFile, server]);

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
        for (const role of createdRoles) { await roleApi.create(currentServerId, { name: role.name, permissions: role.permissions || [], color: role.color || '#99AAB5'}); }
        for (const role of deletedRoles) { await roleApi.delete(currentServerId, role._id); }
        for (const role of updatedRoles) { await roleApi.update(currentServerId, role._id, { name: role.name, permissions: role.permissions, color: role.color }); }
        const orderedByPosition = getOrderedRoles(localRoles);
        const positions = orderedByPosition.filter(r => originalIds.has(r._id)).map((role, index) => ({ roleId: role._id, position: orderedByPosition.length - index }));
        if (positions.length > 0) { await roleApi.updatePositions(currentServerId, positions); }
      },
      onSuccess: () => {
          toast.success("Roles saved!");
          queryClient.invalidateQueries({ queryKey:['roles', currentServerId] });
      },
      onError: (err: any) => toast.error(err.response?.data?.message || "Failed to save roles.")
  })

  const createStickerMutation = useMutation({
    mutationFn: async () => {
      if (!currentServerId) throw new Error('No server ID');
      if (!newStickerFile) throw new Error('No file selected');
      const name = newStickerName.trim();
      if (!name) throw new Error('Sticker name is required');

      const fd = new FormData();
      fd.append('file', newStickerFile);
      fd.append('name', name);
      if (newStickerTags.trim()) fd.append('tags', newStickerTags.trim());
      const res = await stickerApi.create(currentServerId, fd);
      return res.data as Sticker;
    },
    onSuccess: (sticker) => {
      toast.success('Sticker uploaded');
      queryClient.setQueryData(['stickers', currentServerId], (old: Sticker[] | undefined) => {
        const prev = Array.isArray(old) ? old : [];
        if (prev.some(s => s._id === sticker._id)) return prev;
        return [sticker, ...prev];
      });
      setNewStickerFile(null);
      setNewStickerPreview(null);
      setNewStickerName('');
      setNewStickerTags('');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to upload sticker');
    },
  });

  const updateStickerMutation = useMutation({
    mutationFn: async (input: { stickerId: string; name: string; tags: string; description: string }) => {
      if (!currentServerId) throw new Error('No server ID');
      const payload = {
        name: input.name.trim(),
        tags: input.tags.trim() ? input.tags.trim().split(/\s+/g).filter(Boolean) : [],
        description: input.description.trim() || null,
      };
      const res = await stickerApi.update(currentServerId, input.stickerId, payload);
      return res.data as Sticker;
    },
    onSuccess: (sticker) => {
      toast.success('Sticker updated');
      queryClient.setQueryData(['stickers', currentServerId], (old: Sticker[] | undefined) => {
        if (!old) return old;
        return old.map(s => (s._id === sticker._id ? sticker : s));
      });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to update sticker');
    },
  });

  const deleteStickerMutation = useMutation({
    mutationFn: async (stickerId: string) => {
      if (!currentServerId) throw new Error('No server ID');
      await stickerApi.remove(currentServerId, stickerId);
      return stickerId;
    },
    onSuccess: (stickerId) => {
      toast.success('Sticker deleted');
      queryClient.setQueryData(['stickers', currentServerId], (old: Sticker[] | undefined) => {
        if (!old) return old;
        return old.filter(s => s._id !== stickerId);
      });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to delete sticker');
    },
  });

  const selectedRole = useMemo(() => localRoles.find(r => r._id === selectedRoleId), [localRoles, selectedRoleId]);
  const isOwnerRole = useMemo(() => {
    if (!selectedRole) return false;
    return selectedRole.name === 'Owner' || selectedRole.permissions?.includes('ADMINISTRATOR' as Permission);
  }, [selectedRole]);
  const isEveryoneRole = (role: Role) => role.isDefault || role.name === '@everyone';
  const isPinnedRole = (role: Role) => isEveryoneRole(role) || role.name === 'Owner' || role.permissions?.includes('ADMINISTRATOR' as Permission);

  const getOrderedRoles = (roles: Role[]) => {
    const owner = roles.find(r => r.name === 'Owner' || r.permissions?.includes('ADMINISTRATOR' as Permission));
    const everyone = roles.find(r => isEveryoneRole(r));
    const middle = roles
      .filter(r => r !== owner && r !== everyone)
      .sort((a, b) => b.position - a.position);
    return [...(owner ? [owner] : []), ...middle, ...(everyone ? [everyone] : [])];
  };

  const handleResetChanges = () => { if (serverRoles) setLocalRoles(JSON.parse(JSON.stringify(serverRoles))); };
  const handleLocalRoleUpdate = (updates: Partial<Role>) => { if (selectedRoleId) setLocalRoles(prev => prev.map(r => r._id === selectedRoleId ? { ...r, ...updates } : r)); };
  const togglePermission = (permId: string) => {
    if (!selectedRole) return;
    const currentPerms = selectedRole.permissions || [];
    const pId = permId as Permission;
    const hasPerm = currentPerms.includes(pId);
    handleLocalRoleUpdate({ permissions: hasPerm ? currentPerms.filter(p => p !== pId) : [...currentPerms, pId] });
  };
  const isRoleDraggable = (role: Role) => !isPinnedRole(role);
  const applyRoleOrderByIds = (orderedIds: string[]) => {
    const maxPosition = orderedIds.length;
    const positionById = new Map<string, number>();
    orderedIds.forEach((id, index) => { positionById.set(id, maxPosition - index); });
    setLocalRoles(prev => prev.map(r => { const nextPos = positionById.get(r._id); return nextPos ? { ...r, position: nextPos } : r; }));
  };
  const handleRoleDrop = (targetRoleId: string) => {
    if (!draggedRoleId || draggedRoleId === targetRoleId) return;
    const ordered = getOrderedRoles(localRoles);
    const fromIndex = ordered.findIndex(r => r._id === draggedRoleId);
    const toIndex = ordered.findIndex(r => r._id === targetRoleId);
    if (fromIndex < 0 || toIndex < 0) return;
    const dragged = ordered[fromIndex];
    if (!dragged || !isRoleDraggable(dragged)) return;
    ordered.splice(fromIndex, 1);
    const target = ordered[toIndex];
    const targetIsOwner = !!target && (target.name === 'Owner' || target.permissions?.includes('ADMINISTRATOR' as Permission));
    const targetIsEveryone = !!target && isEveryoneRole(target);
    const insertIndex = targetIsOwner ? Math.min(1, ordered.length) : targetIsEveryone ? Math.max(ordered.length - 1, 0) : toIndex;
    ordered.splice(insertIndex, 0, dragged);
    applyRoleOrderByIds(getOrderedRoles(ordered).map(r => r._id));
  };

  const handleSaveOverview = async () => {
    if (!currentServerId || !server || !hasOverviewChanges) return;
    setIsUploading(true);
    try {
      let updated = false;
      if (pendingIconFile) {
        const formData = new FormData();
        formData.append('icon', pendingIconFile);
        await serverApi.uploadIcon(currentServerId, formData);
        updated = true;
      }
      if (name !== server.name) {
        await serverApi.update(currentServerId, { name });
        updated = true;
      }
      if (updated) {
        await queryClient.invalidateQueries({ queryKey: ['server', currentServerId] });
        await queryClient.invalidateQueries({ queryKey: ['servers'] });
        toast.success("Server settings updated!");
        setPendingIconFile(null);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to update server settings");
    } finally {
      setIsUploading(false);
    }
  };

  const handleResetOverview = () => { if (server) { setName(server.name); setPendingIconFile(null); setIconPreview(server.avatarUrl || null); } };
  const handleCreateRole = () => {
    const newRole: Role = { _id: `new_${Date.now()}`, name: 'New Role', color: '#99AAB5', position: localRoles.length, permissions: [], isDefault: false, serverId: currentServerId! };
    setLocalRoles(prev => [...prev, newRole]); setSelectedRoleId(newRole._id); setRoleTab('display'); setMobileRoleEditOpen(true);
  };
  const handleDeleteRole = () => {
    if (!selectedRole || selectedRole.isDefault || isOwnerRole) return;
    openModal('confirm', { title: `Delete Role '${selectedRole.name}'`, description: 'Are you sure?', onConfirm: () => { setLocalRoles(prev => prev.filter(r => r._id !== selectedRoleId)); setMobileRoleEditOpen(false); }});
  };

  const handleIconClick = () => { if (isUploading) return; fileInputRef.current?.click(); };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 50 * 1024 * 1024) { toast.error("Image size must be less than 50MB"); return; }
      setPendingIconFile(file); setIconPreview(URL.createObjectURL(file)); e.target.value = '';
  };
  const handleTabClick = (tab: typeof activeTab) => { setActiveTab(tab); setMobileMenuOpen(false); };
  const handleRoleSelect = (roleId: string) => { setSelectedRoleId(roleId); setMobileRoleEditOpen(true); };

  // New: Handle sticker file selection for upload area
  const handleStickerSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    if (f) {
        if (f.size > 512 * 1024) { // 512KB limit typically for stickers
            toast.error("Sticker max size is 512KB");
            return;
        }
        setNewStickerFile(f);
        setNewStickerPreview(URL.createObjectURL(f));
        // Auto-fill name from filename if empty
        if (!newStickerName.trim()) {
            const base = (f.name || '').replace(/\.[^/.]+$/, '').trim();
            setNewStickerName(base || 'sticker');
        }
    }
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col md:flex-row bg-[#313338] animate-fade-in text-mew-text font-sans overflow-hidden">
         <div className={clsx(
             "w-full md:w-[30%] md:min-w-[220px] bg-[#2B2D31] flex-col md:items-end pt-4 md:pt-[60px] pb-4 px-2 z-10",
             "absolute inset-0 md:static transition-transform duration-300 ease-ios will-change-transform",
             !mobileMenuOpen ? "-translate-x-[20%] opacity-0 pointer-events-none md:translate-x-0 md:opacity-100 md:pointer-events-auto md:flex" : "translate-x-0 flex"
         )}>
             <div className="w-full md:w-[192px] px-4 md:px-1.5">
                <div className="flex md:hidden items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-white">Server Settings</h2>
                    <button onClick={closeModal} className="p-2 text-mew-textMuted hover:text-white"><Icon icon="mdi:close" width="24" /></button>
                </div>
                <h2 className="text-xs font-bold text-mew-textMuted uppercase mb-3 px-2.5 hidden md:block">Server Settings</h2>
                <SidebarItem label="Overview" isActive={activeTab === 'overview'} onClick={() => handleTabClick('overview')} />
                <SidebarItem label="Roles" isActive={activeTab === 'roles'} onClick={() => handleTabClick('roles')} />
                <SidebarItem label="Emoji" isActive={activeTab === 'emoji'} onClick={() => handleTabClick('emoji')} />
                <SidebarItem label="Stickers" isActive={activeTab === 'stickers'} onClick={() => handleTabClick('stickers')} />
                <div className="h-[1px] bg-mew-divider my-2 mx-2 opacity-50"></div>
                <div className="px-2.5 py-1.5 rounded-[4px] text-mew-textMuted hover:bg-[#35373C] font-medium text-sm cursor-pointer mb-0.5 flex justify-between group text-red-400" onClick={() => openModal('deleteServer', { server })}>
                    <span>Delete Server</span><Icon icon="mdi:trash-can-outline" />
                </div>
             </div>
         </div>

         {/* Content Area (Right) */}
         <div className={clsx(
             "flex-1 bg-[#313338] pt-0 md:pt-[60px] px-0 md:px-10 max-w-full md:max-w-[800px] overflow-hidden flex flex-col h-full",
             "absolute inset-0 md:static transition-transform duration-300 ease-ios will-change-transform z-20",
             mobileMenuOpen ? "translate-x-[100%] md:translate-x-0 md:flex" : "translate-x-0 flex"
         )}>
             
             {/* Mobile Content Header */}
             <div className="md:hidden h-14 flex items-center px-4 bg-[#313338] border-b border-[#26272D] sticky top-0 z-20 shrink-0">
                <button onClick={() => setMobileMenuOpen(true)} className="mr-4 text-mew-textMuted hover:text-white active:scale-90 transition-transform"><Icon icon="mdi:arrow-left" width="24" /></button>
                <span className="font-bold text-lg text-white capitalize animate-fade-in">{activeTab}</span>
            </div>

             {/* OVERVIEW CONTENT (unchanged for brevity, assuming existing structure) */}
             {activeTab === 'overview' && (
               // ... existing overview code ...
               <div className="animate-fade-in overflow-y-auto custom-scrollbar h-full pb-20 p-4 md:p-0">
                 <h2 className="text-xl font-bold text-white mb-6 hidden md:block">Server Overview</h2>
                 <div className="flex flex-col md:flex-row gap-8">
                     <div className="flex items-center justify-center">
                         <div className="relative group cursor-pointer" onClick={handleIconClick}>
                             <div className="w-[100px] h-[100px] rounded-full bg-mew-accent flex items-center justify-center overflow-hidden relative">
                                 <input type="file" ref={fileInputRef} className="hidden" accept="image/png, image/jpeg, image/gif" onChange={handleFileChange} />
                                 {iconPreview ? <img src={iconPreview} alt="Server Icon" className="w-full h-full object-cover" /> : <div className="text-white text-3xl font-bold">{server?.name?.substring(0,2).toUpperCase()}</div>}
                                 <div className={clsx("absolute inset-0 bg-black/40 rounded-full flex items-center justify-center transition-opacity", isUploading ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
                                     {isUploading ? <Icon icon="mdi:loading" className="text-white animate-spin" width="32" /> : <span className="text-xs font-bold text-white uppercase text-center px-2">Change Icon</span>}
                                 </div>
                             </div>
                         </div>
                     </div>
                     <div className="flex-1 space-y-4">
                         <div>
                            <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">Server Name</label>
                            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-[#1E1F22] text-white p-2.5 rounded border-none focus:outline-none focus:ring-0 font-medium" />
                         </div>
                     </div>
                 </div>
                 {hasOverviewChanges && (
                    <div className="absolute bottom-4 left-4 right-4 bg-[#1E1F22] p-2 rounded-md shadow-lg flex items-center justify-between animate-fade-in-up z-30">
                        <span className="text-sm text-mew-textMuted truncate mr-2">Unsaved changes!</span>
                        <div className="flex shrink-0">
                            <button onClick={handleResetOverview} className="text-white hover:underline text-sm font-medium px-3 py-2">Reset</button>
                            <button onClick={handleSaveOverview} disabled={isUploading} className="bg-green-500 hover:bg-green-600 text-white rounded px-4 py-2 text-sm font-medium">{isUploading ? '...' : 'Save'}</button>
                        </div>
                    </div>
                )}
               </div>
             )}

             {/* ROLES CONTENT (unchanged for brevity, assuming existing structure) */}
             {activeTab === 'roles' && (
                <div className="flex flex-col md:flex-row h-full relative overflow-hidden">
                  <div className={clsx("w-full md:w-[200px] flex-shrink-0 flex flex-col md:pr-4 md:border-r border-[#3F4147] h-full p-4 md:p-0", "absolute inset-0 md:static transition-transform duration-300 ease-ios bg-[#313338]", mobileRoleEditOpen ? "-translate-x-[20%] opacity-0 pointer-events-none md:translate-x-0 md:opacity-100 md:pointer-events-auto md:flex" : "translate-x-0 flex")}>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xs font-bold text-mew-textMuted uppercase">Roles</h3>
                      <button onClick={handleCreateRole} className="text-mew-textMuted hover:text-white"><Icon icon="mdi:plus" width="18" /></button>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-0.5">
                      {getOrderedRoles(localRoles).map(role => (
                          <div key={role._id} className={clsx("flex items-center px-2 py-2 md:py-1.5 rounded cursor-pointer group mb-1", selectedRoleId === role._id ? "bg-[#404249]" : "bg-[#2B2D31] md:bg-transparent hover:bg-[#35373C]")} onClick={() => handleRoleSelect(role._id)}>
                            <div className="w-3 h-3 rounded-full mr-2 flex-shrink-0" style={{ backgroundColor: role.color }}></div>
                            <span className={clsx("text-sm font-medium truncate flex-1", selectedRoleId === role._id ? "text-white" : "text-[#B5BAC1]")}>{role.name}</span>
                          </div>
                      ))}
                    </div>
                  </div>
                  <div className={clsx("flex-1 md:pl-6 flex flex-col overflow-hidden h-full bg-[#313338] absolute inset-0 md:static z-20 md:z-auto", "transition-transform duration-300 ease-ios", mobileRoleEditOpen ? "translate-x-0 flex" : "translate-x-[100%] md:translate-x-0 md:hidden md:flex")}>
                    {selectedRole ? (
                    <>
                     <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#3F4147] p-4 md:p-0">
                       <div className="flex items-center gap-2">
                           <button onClick={() => setMobileRoleEditOpen(false)} className="md:hidden text-mew-textMuted hover:text-white"><Icon icon="mdi:arrow-left" width="24" /></button>
                           <h2 className="text-lg font-bold text-white truncate max-w-[150px] md:max-w-none">{selectedRole.name}</h2>
                       </div>
                       <div className="flex bg-[#1E1F22] rounded-[3px] p-0.5 shrink-0">
                          <button className={clsx("px-3 md:px-4 py-1 rounded-[2px] text-xs md:text-sm font-medium transition-colors", roleTab === 'display' ? "bg-[#404249] text-white" : "text-mew-textMuted hover:text-mew-text")} onClick={() => setRoleTab('display')}>Display</button>
                          <button className={clsx("px-3 md:px-4 py-1 rounded-[2px] text-xs md:text-sm font-medium transition-colors", roleTab === 'permissions' ? "bg-[#404249] text-white" : "text-mew-textMuted hover:text-mew-text")} onClick={() => setRoleTab('permissions')}>Perms</button>
                       </div>
                     </div>
                     <div className="flex-1 overflow-y-auto custom-scrollbar pb-24 p-4 md:p-0">
                        {roleTab === 'display' && (
                          <div className="space-y-6 animate-fade-in">
                            <div>
                               <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">Role Name</label>
                               <input type="text" value={selectedRole.name} onChange={(e) => handleLocalRoleUpdate({ name: e.target.value })} disabled={selectedRole.isDefault} className={clsx("w-full bg-[#1E1F22] text-white p-2.5 rounded border-none focus:outline-none focus:ring-0 font-medium", selectedRole.isDefault && "opacity-50 cursor-not-allowed")} />
                            </div>
                            <div>
                               <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">Role Color</label>
                               <div className="grid grid-cols-6 gap-2 mb-3">
                                  {PRESET_COLORS.map(color => (<div key={color} className={clsx("w-full pt-[100%] rounded cursor-pointer relative", selectedRole.color === color && "ring-2 ring-white ring-offset-2 ring-offset-[#313338]")} style={{ backgroundColor: color }} onClick={() => handleLocalRoleUpdate({ color })} ></div>))}
                               </div>
                            </div>
                          </div>
                        )}
                        {roleTab === 'permissions' && (
                          <div className="space-y-8 animate-fade-in">
                            {PERMISSION_GROUPS.map(group => (
                              <div key={group.group}>
                                <h3 className="text-xs font-bold text-mew-textMuted uppercase mb-4">{group.group}</h3>
                                <div className="space-y-4">
                                  {group.perms.map(perm => {
                                    const hasAdmin = selectedRole.permissions?.includes('ADMINISTRATOR' as Permission);
                                    const isEnabled = hasAdmin ? true : selectedRole.permissions?.includes(perm.id as Permission);
                                    const isDisabled = selectedRole.isDefault && (perm.id === 'ADMINISTRATOR' || perm.id === 'KICK_MEMBERS');
                                    return (
                                      <div key={perm.id} className={clsx("flex items-center justify-between", isDisabled && 'opacity-50')}>
                                        <div className="mr-4"><div className="font-medium text-white text-base">{perm.name}</div><div className="text-xs text-[#B5BAC1] hidden sm:block">{perm.desc}</div></div>
                                        <div onClick={() => !isDisabled && togglePermission(perm.id)} className={clsx("w-10 h-6 rounded-full p-1 transition-colors flex-shrink-0 relative", isEnabled ? "bg-green-500" : "bg-[#80848E]", isDisabled ? 'cursor-not-allowed' : 'cursor-pointer' )}><div className={clsx("w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200", isEnabled ? "translate-x-4" : "translate-x-0" )}></div></div>
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
                    </>
                    ) : <div className='flex-1 flex items-center justify-center text-mew-textMuted p-4 text-center'>Select a role to start editing.</div>}
                  </div>
                  {hasChanges && (
                    <div className="absolute bottom-4 left-4 right-4 bg-[#1E1F22] p-2 rounded-md shadow-lg flex items-center justify-between animate-fade-in-up z-30">
                        <span className="text-sm text-mew-textMuted truncate mr-2">Unsaved changes!</span>
                        <div className="flex shrink-0">
                            <button onClick={handleResetChanges} className="text-white hover:underline text-sm font-medium px-3 py-2">Reset</button>
                            <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="bg-green-500 hover:bg-green-600 text-white rounded px-4 py-2 text-sm font-medium">{saveMutation.isPending ? '...' : 'Save'}</button>
                        </div>
                    </div>
                )}
                </div>
             )}

             {activeTab === 'emoji' && <div className="flex flex-col items-center justify-center h-full text-mew-textMuted"><Icon icon="mdi:hammer-wrench" width="48" className="mb-2 opacity-50" /><p>This setting is coming soon.</p></div>}

             {/* STICKERS - IMPROVED UI */}
             {activeTab === 'stickers' && (
              <div className="h-full flex flex-col p-4 md:p-0 overflow-hidden">
                <div className="pb-4 border-b border-[#3F4147] shrink-0">
                  <h2 className="text-xl font-bold text-white mb-2">Stickers</h2>
                  <p className="text-sm text-mew-textMuted">Upload and manage server stickers. The first 30 stickers are free!</p>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar py-6 space-y-8">
                  {/* Upload Section */}
                  <div>
                    {!canManageStickers && <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-200 text-sm p-3 rounded mb-4">You do not have permission to manage stickers.</div>}
                    
                    <div className="flex gap-4 items-start">
                        {/* Drag/Drop Zone Lookalike */}
                        <div 
                            onClick={() => canManageStickers && stickerInputRef.current?.click()}
                            className={clsx(
                                "w-24 h-24 rounded-lg border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors shrink-0",
                                canManageStickers ? "border-[#4E5058] hover:border-mew-textMuted bg-[#1E1F22] hover:bg-[#232428]" : "border-[#2F3136] bg-[#202225] opacity-50 cursor-not-allowed"
                            )}
                        >
                            <input 
                                type="file" 
                                ref={stickerInputRef} 
                                className="hidden" 
                                accept="image/png,image/gif,image/webp" 
                                onChange={handleStickerSelect}
                                disabled={!canManageStickers}
                            />
                            {newStickerPreview ? (
                                <img src={newStickerPreview} className="w-full h-full object-contain p-1" />
                            ) : (
                                <>
                                    <Icon icon="mdi:plus" className="text-mew-textMuted mb-1" width="24" />
                                    <span className="text-[10px] font-bold text-mew-textMuted uppercase">Upload</span>
                                </>
                            )}
                        </div>

                        {/* Upload Form Inputs */}
                        <div className="flex-1 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-mew-textMuted uppercase mb-1 block">Sticker Name</label>
                                    <input 
                                        value={newStickerName} 
                                        onChange={e => setNewStickerName(e.target.value)} 
                                        className="w-full bg-[#1E1F22] text-white p-2 rounded text-sm outline-none focus:ring-1 focus:ring-mew-accent transition-all"
                                        placeholder="Give it a name"
                                        disabled={!canManageStickers}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-mew-textMuted uppercase mb-1 block">Related Emoji / Tags</label>
                                    <input 
                                        value={newStickerTags} 
                                        onChange={e => setNewStickerTags(e.target.value)} 
                                        className="w-full bg-[#1E1F22] text-white p-2 rounded text-sm outline-none focus:ring-1 focus:ring-mew-accent transition-all"
                                        placeholder="e.g. :smile: happy"
                                        disabled={!canManageStickers}
                                    />
                                </div>
                            </div>
                            
                            {newStickerFile && (
                                <div className="flex justify-end">
                                    <button 
                                        onClick={() => createStickerMutation.mutate()} 
                                        disabled={createStickerMutation.isPending || !newStickerName.trim()}
                                        className="bg-mew-accent hover:bg-mew-accentHover text-white px-4 py-1.5 rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {createStickerMutation.isPending ? 'Uploading...' : 'Upload Sticker'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                  </div>

                  <div className="h-[1px] bg-[#3F4147]"></div>

                  {/* Existing Stickers List */}
                  <div>
                    <h3 className="text-xs font-bold text-mew-textMuted uppercase mb-4">
                        {stickers?.length || 0} Stickers
                    </h3>
                    
                    {isLoadingStickers ? (
                        <div className="flex justify-center py-8"><Icon icon="mdi:loading" className="animate-spin text-mew-textMuted" width="24" /></div>
                    ) : !stickers?.length ? (
                        <div className="text-center py-10 bg-[#2B2D31] rounded-lg border border-dashed border-[#3F4147]">
                            <Icon icon="mdi:sticker-emoji" className="text-[#4E5058] mx-auto mb-2" width="40" />
                            <p className="text-mew-textMuted text-sm">No stickers found.</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {stickers.map(s => {
                                const draft = stickerDrafts[s._id] || { name: s.name || '', tags: (s.tags || []).join(' '), description: s.description || '' };
                                return (
                                    <div key={s._id} className="group flex items-center p-2 rounded hover:bg-[#2B2D31] hover:shadow-sm border border-transparent hover:border-[#26272D] transition-all">
                                        <div className="w-16 h-16 bg-[#202225] rounded flex items-center justify-center shrink-0 mr-4">
                                            <img src={s.url} alt={s.name} className="w-full h-full object-contain p-1" />
                                        </div>
                                        
                                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4 mr-4">
                                            <div>
                                                <input 
                                                    value={draft.name} 
                                                    onChange={(e) => setStickerDrafts(prev => ({ ...prev, [s._id]: { ...draft, name: e.target.value } }))}
                                                    className="bg-transparent text-white font-medium text-sm w-full outline-none border-b border-transparent focus:border-mew-accent transition-colors placeholder-mew-textMuted/50"
                                                    placeholder="Name"
                                                    disabled={!canManageStickers}
                                                />
                                            </div>
                                            <div>
                                                <input 
                                                    value={draft.tags} 
                                                    onChange={(e) => setStickerDrafts(prev => ({ ...prev, [s._id]: { ...draft, tags: e.target.value } }))}
                                                    className="bg-transparent text-mew-textMuted text-sm w-full outline-none border-b border-transparent focus:border-mew-accent transition-colors placeholder-mew-textMuted/50"
                                                    placeholder="Tags"
                                                    disabled={!canManageStickers}
                                                />
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button 
                                                onClick={() => updateStickerMutation.mutate({ stickerId: s._id, ...draft })}
                                                disabled={updateStickerMutation.isPending}
                                                className="p-1.5 text-mew-textMuted hover:text-green-400 hover:bg-[#202225] rounded transition-colors"
                                                title="Save Changes"
                                            >
                                                <Icon icon="mdi:check" width="20" />
                                            </button>
                                            <button 
                                                onClick={() => openModal('confirm', {
                                                    title: `Delete sticker '${s.name}'`,
                                                    description: 'Are you sure you want to delete this sticker? This cannot be undone.',
                                                    onConfirm: () => deleteStickerMutation.mutate(s._id),
                                                })}
                                                disabled={deleteStickerMutation.isPending}
                                                className="p-1.5 text-mew-textMuted hover:text-red-400 hover:bg-[#202225] rounded transition-colors"
                                                title="Delete Sticker"
                                            >
                                                <Icon icon="mdi:trash-can-outline" width="20" />
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                  </div>
                </div>
              </div>
             )}
         </div>

         {/* Close Button (Desktop) */}
         <div className="hidden md:block w-[18%] min-w-[60px] pt-[60px] pl-5">
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
        <div onClick={onClick} className={clsx("px-2.5 py-1.5 rounded-[4px] cursor-pointer mb-0.5 font-medium text-sm transition-colors", isActive ? "bg-[#404249] text-white" : "text-mew-textMuted hover:bg-[#35373C] hover:text-mew-text")}>
            {label}
        </div>
    )
}
