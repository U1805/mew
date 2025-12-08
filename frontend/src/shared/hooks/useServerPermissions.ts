import { useQueries } from '@tanstack/react-query';
import { useAuthStore, useUIStore } from '../stores/store';
import { ServerMember, Role } from '../types';
import { useMemo } from 'react';
import { serverApi } from '../services/api';
import { ALL_PERMISSIONS } from '../constants/permissions';

/**
 * A reactive hook to get the current user's effective permissions on the current server.
 * It fetches and waits for the necessary data (members and roles) on its own.
 *
 * @returns An object containing a Set of permission strings and a boolean `isOwner` flag.
 */
export const useServerPermissions = (): { permissions: Set<string>; isOwner: boolean } => {
    const { currentServerId } = useUIStore();
    const { user } = useAuthStore();

    const results = useQueries({
        queries: [
            {
                queryKey: ['members', currentServerId],
                // fix: 保持与其他组件一致，在 queryFn 中直接返回 res.data
                queryFn: () => serverApi.getMembers(currentServerId!).then(res => res.data),
                enabled: !!currentServerId,
                // remove: 移除 select，因为数据已经是我们需要的格式了
            },
            {
                queryKey: ['roles', currentServerId],
                // fix: 保持与其他组件一致，在 queryFn 中直接返回 res.data
                queryFn: () => serverApi.getRoles(currentServerId!).then(res => res.data),
                enabled: !!currentServerId,
                // remove: 移除 select
            }
        ],
    });

    const members = results[0].data as ServerMember[] | undefined;
    const roles = results[1].data as Role[] | undefined;
    const isLoading = results.some(r => r.isLoading);

    const serverPermissions = useMemo(() => {
        const result = { permissions: new Set<string>(), isOwner: false };

        // 增加 Array.isArray 检查以防御潜在的数据格式问题
        if (isLoading || !members || !Array.isArray(members) || !roles || !Array.isArray(roles) || !user) {
            return result;
        }

        const myMember = members.find(m => m.userId?._id === user._id);
        if (!myMember) {
            return result;
        }

        result.isOwner = myMember.isOwner || false;

        if (myMember.isOwner) {
            result.permissions = new Set<string>(ALL_PERMISSIONS);
            return result;
        }

        const everyoneRole = roles.find(r => r.isDefault);
        const finalPermissions = new Set<string>(everyoneRole?.permissions || []);

        const myRoleIds = myMember.roleIds || [];
        const memberRoles = roles.filter(role => myRoleIds.includes(role._id));

        memberRoles.forEach(role => {
            role.permissions.forEach(perm => {
                finalPermissions.add(perm);
            });
        });

        if (finalPermissions.has('ADMINISTRATOR')) {
            result.permissions = new Set<string>(ALL_PERMISSIONS);
            return result;
        }

        result.permissions = finalPermissions;
        return result;

    }, [isLoading, members, roles, user]);

    return serverPermissions;
};
