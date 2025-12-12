import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@iconify/react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { memberApi } from '../../../shared/services/api';
import { ServerMember, Role } from '../../../shared/types';
import { usePresenceStore } from '../../../shared/stores/presenceStore';
import { useUIStore, useModalStore, useAuthStore } from '../../../shared/stores';
import { useServerPermissions } from '../../../shared/hooks/useServerPermissions';
import { useMembers } from '../../../shared/hooks/useMembers';
import { useRoles } from '../../../shared/hooks/useRoles';


// Get the highest role position for a member
const getHighestRolePos = (member: ServerMember, roles: Role[]) => {
  if (member.isOwner) return Infinity;
  // 增加防御性检查
  if (!Array.isArray(roles)) return 0;
  const memberRoleIds = member.roleIds || [];
  if (memberRoleIds.length === 0) return 0;
  const memberRoles = roles.filter(r => memberRoleIds.includes(r._id));
  if (memberRoles.length === 0) return 0;
  return Math.max(...memberRoles.map(r => r.position));
};

const MemberList: React.FC = () => {
  const { currentServerId, currentChannelId } = useUIStore();
  const onlineStatus = usePresenceStore(state => state.onlineStatus);

  // Fetch server members
  const { data: members, isLoading: membersLoading } = useMembers(currentServerId);

  // Fetch server roles
  const { data: roles, isLoading: rolesLoading } = useRoles(currentServerId);

  if (!currentServerId) return null;

  const isLoading = membersLoading || rolesLoading;

  const memberGroups = React.useMemo(() => {
    if (!members || !roles) return [];

    // 1. Initialize groups for all roles
    const everyoneRole = roles.find(r => r.isDefault);
    const groups: Record<string, ServerMember[]> = {};

    if (everyoneRole) {
      groups[everyoneRole.name] = [];
    }

    roles
      .filter(r => !r.isDefault)
      .sort((a, b) => b.position - a.position)
      .forEach(role => {
        groups[role.name] = [];
      });

    // 2. Assign members to their highest role group, filtering webhooks by channel
    members.forEach(member => {
      // Filter Webhooks: If member has a channelId, it must match the current channel
      if (member.channelId && member.channelId !== currentChannelId) {
        return;
      }

      const memberRoleIds = member.roleIds || [];
      const highestExplicitRole = roles
        .filter(r => !r.isDefault && memberRoleIds.includes(r._id))
        .sort((a, b) => b.position - a.position)[0];

      if (highestExplicitRole) {
        groups[highestExplicitRole.name].push(member);
      } else if (everyoneRole) {
        groups[everyoneRole.name].push(member);
      }
    });

    // 3. Sort members within each group
    for (const groupName in groups) {
      groups[groupName].sort((a, b) => {
        const posA = getHighestRolePos(a, roles);
        const posB = getHighestRolePos(b, roles);
        if (posA !== posB) return posB - posA;
        return (a.userId?.username || '').localeCompare(b.userId?.username || '');
      });
    }

    // 4. Filter out empty groups and format for rendering
    return Object.entries(groups)
      .filter(([, membersInGroup]) => membersInGroup.length > 0)
      .sort(([nameA], [nameB]) => {
        const roleA = roles.find(r => r.name === nameA);
        const roleB = roles.find(r => r.name === nameB);
        if (roleA && roleB) {
          if (roleA.isDefault) return 1; // Always move @everyone to the end
          if (roleB.isDefault) return -1;
          return roleB.position - roleA.position; // Sort by role position descending
        }
        return 0;
      });

  }, [members, roles, currentChannelId]);


  return (
    <div className="w-60 bg-[#2B2D31] flex flex-col flex-shrink-0 h-full overflow-y-auto custom-scrollbar p-3">
      {isLoading ? (
          <div className="flex justify-center mt-10">
             <Icon icon="mdi:loading" className="animate-spin text-mew-textMuted" />
          </div>
      ) : (
          <>
            {memberGroups.map(([groupName, members]) => (
                <MemberGroup
                    key={groupName}
                    title={`${groupName} — ${members.length}`}
                    members={members}
                    onlineStatus={onlineStatus}
                />
            ))}
          </>
      )}
    </div>
  );
};

interface MemberGroupProps {
    title: string;
    members: ServerMember[];
    onlineStatus: Record<string, 'online' | 'offline'>;
}

const MemberGroup: React.FC<MemberGroupProps> = ({ title, members, onlineStatus }) => {
    const { openModal } = useModalStore();

    if (members.length === 0) return null;

    return (
        <div className="mb-4">
            <h3 className="text-xs font-bold text-mew-textMuted uppercase mb-2 px-2 tracking-wide">{title}</h3>
            {members.map(member => (
                <MemberItem
                    key={member._id}
                    member={member}
                    isOnline={onlineStatus[member.userId._id] === 'online'}
                    onClick={() => openModal('userProfile', { user: member.userId })}
                />
            ))}
        </div>
    )
}

interface MemberItemProps {
    member: ServerMember;
    isOnline: boolean;
    onClick: () => void;
}

const MemberItem: React.FC<MemberItemProps> = ({ member, isOnline, onClick }) => {
    const u = member.userId;
    if (!u) return null;

    const content = (
      <div
        className="flex items-center px-2 py-1.5 rounded hover:bg-[#35373C] cursor-pointer group"
        onClick={onClick}
      >
        <div className="relative mr-3">
          <div className="w-8 h-8 rounded-full bg-mew-accent flex items-center justify-center overflow-hidden">
            {u.avatarUrl ? (
              <img src={u.avatarUrl} alt={u.username} className="w-full h-full object-cover" />
            ) : (
              <span className="text-white text-xs font-bold">{u.username.substring(0, 2).toUpperCase()}</span>
            )}
          </div>
          {isOnline && !u.isBot && (
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 border-[3px] border-[#2B2D31] rounded-full bg-green-500"></div>
          )}
        </div>
        <div className="flex items-center flex-1 min-w-0">
          <div className="font-medium text-sm truncate text-white">
            {u.username}
          </div>
          {u.isBot && (
            <div className="ml-1.5 text-[10px] font-bold text-white bg-[#5865F2] inline-block px-1 rounded-[3px] leading-3 shrink-0">BOT</div>
          )}
        </div>
      </div>
    );

    if (u.isBot) {
      return content;
    }

    return (
        <ContextMenu.Root>
            <ContextMenu.Trigger>
               {content}
            </ContextMenu.Trigger>
            <MemberContextMenu targetMember={member} />
        </ContextMenu.Root>
    )
}

const MemberContextMenu: React.FC<{ targetMember: ServerMember }> = ({ targetMember }) => {
    const { currentServerId } = useUIStore();
    const { user: currentUser } = useAuthStore();
    const { openModal } = useModalStore();
    const queryClient = useQueryClient();
    const { permissions: serverPermissions } = useServerPermissions();

    const roles = queryClient.getQueryData<Role[]>(['roles', currentServerId]);
    const members = queryClient.getQueryData<ServerMember[]>(['members', currentServerId]);

    const requesterMember = members?.find(m => m.userId?._id === currentUser?._id);
    if (!targetMember.userId || !currentUser || !requesterMember || !currentServerId || !roles) return null;

    const targetUserId = targetMember.userId._id;

    const myHighestRolePos = getHighestRolePos(requesterMember, roles);
    const targetHighestRolePos = getHighestRolePos(targetMember, roles);

    const canManageMember = requesterMember.isOwner || myHighestRolePos > targetHighestRolePos;

    const canKick = serverPermissions.has('KICK_MEMBERS') && canManageMember && targetUserId !== currentUser._id;
    const canManageRoles = serverPermissions.has('MANAGE_ROLES') && canManageMember && !targetMember.userId.isBot;

    const handleToggleRole = async (roleId: string) => {
        const currentRoleIds = targetMember.roleIds || [];
        const newRoleIds = currentRoleIds.includes(roleId)
            ? currentRoleIds.filter(id => id !== roleId)
            : [...currentRoleIds, roleId];

        try {
            await memberApi.updateRoles(currentServerId, targetUserId, newRoleIds);
            queryClient.invalidateQueries({ queryKey: ['members', currentServerId] });
        } catch(e) {
            console.error("Failed to update roles", e)
        }
    }

    if (!canKick && !canManageRoles) return null;

    return (
        <ContextMenu.Content className="min-w-[188px] bg-[#111214] rounded p-1.5 shadow-xl z-50 animate-fade-in border border-[#1E1F22]">
            {canManageRoles && (
                <ContextMenu.Sub>
                    <ContextMenu.SubTrigger className="flex items-center justify-between px-2 py-1.5 hover:bg-mew-accent hover:text-white text-mew-textMuted rounded cursor-pointer text-sm font-medium outline-none">
                        Roles
                        <Icon icon="mdi:chevron-right" width="16" />
                    </ContextMenu.SubTrigger>
                    <ContextMenu.SubContent className="min-w-[160px] bg-[#111214] rounded p-1.5 shadow-xl z-50 border border-[#1E1F22] ml-1">
                        {roles.filter(r => !r.isDefault).sort((a,b) => b.position - a.position).map(role => (
                            <ContextMenu.Item
                                key={role._id}
                                className="flex items-center px-2 py-1.5 hover:bg-[#35373C] text-[#B5BAC1] hover:text-white rounded cursor-pointer text-sm font-medium outline-none"
                                onSelect={(e) => { e.preventDefault(); handleToggleRole(role._id); }}
                            >
                                <div className="w-4 h-4 border border-[#B5BAC1] rounded mr-2 flex items-center justify-center">
                                    {(targetMember.roleIds || []).includes(role._id) && <Icon icon="mdi:check" className="w-3 h-3" />}
                                </div>
                                <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: role.color }}></div>
                                {role.name}
                            </ContextMenu.Item>
                        ))}
                    </ContextMenu.SubContent>
                </ContextMenu.Sub>
            )}

            {(canKick && canManageRoles) && <ContextMenu.Separator className="h-[1px] bg-mew-divider my-1" />}

            {canKick && (
                <ContextMenu.Item
                    className="flex items-center px-2 py-1.5 hover:bg-red-500 hover:text-white text-red-400 rounded cursor-pointer text-sm font-medium outline-none"
                    onSelect={() => openModal('kickUser', { user: targetMember.userId, serverId: currentServerId })}
                >
                    Kick {targetMember.userId?.username}
                </ContextMenu.Item>
            )}
        </ContextMenu.Content>
    )
}

export default MemberList;
