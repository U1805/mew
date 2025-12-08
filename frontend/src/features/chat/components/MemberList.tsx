import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@iconify/react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import clsx from 'clsx';
import { serverApi } from '../../../shared/services/api';
import { ServerMember } from '../../../shared/types';
import { usePresenceStore } from '../../../shared/stores/presenceStore';
import { useUIStore, useModalStore, useAuthStore } from '../../../shared/stores/store';

// Mock Roles for Member List Context Menu
const MOCK_ROLES = [
    { id: '2', name: 'Admin', color: '#E74C3C' },
    { id: '3', name: 'Moderator', color: '#3498DB' },
    { id: '4', name: 'Member', color: '#99AAB5' },
];

const MemberList: React.FC = () => {
  const { currentServerId } = useUIStore();
  const { user } = useAuthStore();
  const onlineStatus = usePresenceStore(state => state.onlineStatus);

  const { data: members, isLoading } = useQuery({
    queryKey: ['members', currentServerId],
    queryFn: async () => {
      if (!currentServerId) return [];
      const res = await serverApi.getMembers(currentServerId);
      return res.data as ServerMember[];
    },
    enabled: !!currentServerId
  });

  if (!currentServerId) return null;

  const myMember = members?.find(m => m.userId?._id === user?._id);
  const isOwner = myMember?.role === 'OWNER';

  // Sort by role (Owner first) then alphabetically
  const sortedMembers = members?.sort((a, b) => {
      if (a.role === 'OWNER' && b.role !== 'OWNER') return -1;
      if (a.role !== 'OWNER' && b.role === 'OWNER') return 1;
      return (a.userId?.username || '').localeCompare(b.userId?.username || '');
  });

  // Simple grouping - Owners and Everyone else for now
  // Real apps might use presence status
  const admins = sortedMembers?.filter(m => m.role === 'OWNER') || [];
  const others = sortedMembers?.filter(m => m.role !== 'OWNER') || [];

  return (
    <div className="w-60 bg-[#2B2D31] flex flex-col flex-shrink-0 h-full overflow-y-auto custom-scrollbar p-3">
      {isLoading ? (
          <div className="flex justify-center mt-10">
             <Icon icon="mdi:loading" className="animate-spin text-mew-textMuted" />
          </div>
      ) : (
          <>
            <MemberGroup 
                title={`Owner — ${admins.length}`} 
                members={admins} 
                currentUser={user}
                isOwner={isOwner}
                serverId={currentServerId}
                onlineStatus={onlineStatus}
            />
            <MemberGroup 
                title={`Members — ${others.length}`} 
                members={others} 
                currentUser={user}
                isOwner={isOwner}
                serverId={currentServerId}
                onlineStatus={onlineStatus}
            />
          </>
      )}
    </div>
  );
};

const MemberGroup = ({ 
    title, 
    members, 
    currentUser,
    isOwner,
    serverId,
    onlineStatus
}: { 
    title: string, 
    members: ServerMember[], 
    currentUser: any,
    isOwner: boolean,
    serverId: string,
    onlineStatus: Record<string, 'online' | 'offline'>
}) => {
    const { openModal } = useModalStore();

    if (members.length === 0) return null;
    return (
        <div className="mb-6">
            <h3 className="text-xs font-bold text-mew-textMuted uppercase mb-2 px-2">{title}</h3>
            {members.map(member => {
                const u = member.userId;
                if (!u) return null; 
                
                const canManage = isOwner && u._id !== currentUser._id;
                const isOnline = onlineStatus[u._id] === 'online';

                return (
                    // eslint-disable-next-line react/jsx-key
                    <ContextMenu.Root>
                        <ContextMenu.Trigger>
                            <div 
                                className="flex items-center px-2 py-1.5 rounded hover:bg-[#35373C] cursor-pointer group"
                                onClick={() => openModal('userProfile', { user: u })}
                            >
                                <div className="relative mr-3">
                                    <div className="w-8 h-8 rounded-full bg-mew-accent flex items-center justify-center overflow-hidden">
                                        {u.avatarUrl ? (
                                            <img src={u.avatarUrl} alt={u.username} className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="text-white text-xs font-bold">{u.username.substring(0, 2).toUpperCase()}</span>
                                        )}
                                    </div>
                                    {isOnline && (
                                        <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 border-[3px] border-[#2B2D31] rounded-full bg-green-500"></div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm truncate text-white">
                                        {u.username}
                                    </div>
                                    {u.isBot && (
                                        <div className="text-[10px] font-bold text-white bg-[#5865F2] inline-block px-1 rounded-[3px] leading-3 mt-0.5">BOT</div>
                                    )}
                                </div>
                            </div>
                        </ContextMenu.Trigger>
                        
                        {canManage && (
                            <ContextMenu.Content className="min-w-[188px] bg-[#111214] rounded p-1.5 shadow-xl z-50 animate-fade-in border border-[#1E1F22]">
                                <ContextMenu.Sub>
                                    <ContextMenu.SubTrigger className="flex items-center justify-between px-2 py-1.5 hover:bg-mew-accent hover:text-white text-mew-textMuted rounded cursor-pointer text-sm font-medium outline-none">
                                        Roles
                                        <Icon icon="mdi:chevron-right" width="16" />
                                    </ContextMenu.SubTrigger>
                                    <ContextMenu.SubContent className="min-w-[160px] bg-[#111214] rounded p-1.5 shadow-xl z-50 border border-[#1E1F22] ml-1">
                                        {MOCK_ROLES.map(role => (
                                            <ContextMenu.Item 
                                                key={role.id}
                                                className="flex items-center px-2 py-1.5 hover:bg-[#35373C] text-[#B5BAC1] hover:text-white rounded cursor-pointer text-sm font-medium outline-none"
                                            >
                                                <div className="w-4 h-4 border border-[#B5BAC1] rounded mr-2"></div>
                                                <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: role.color }}></div>
                                                {role.name}
                                            </ContextMenu.Item>
                                        ))}
                                    </ContextMenu.SubContent>
                                </ContextMenu.Sub>

                                <ContextMenu.Separator className="h-[1px] bg-mew-divider my-1" />

                                <ContextMenu.Item 
                                    className="flex items-center px-2 py-1.5 hover:bg-red-500 hover:text-white text-red-400 rounded cursor-pointer text-sm font-medium outline-none"
                                    onSelect={() => openModal('kickUser', { user: u, serverId })}
                                >
                                    Kick {u.username}
                                </ContextMenu.Item>
                            </ContextMenu.Content>
                        )}
                    </ContextMenu.Root>
                )
            })}
        </div>
    )
}

export default MemberList;