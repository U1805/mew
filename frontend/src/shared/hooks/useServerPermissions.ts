import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore, useUIStore } from '../stores/store';
import { ServerMember, Role, Server } from '../types';
import { useMemo } from 'react';

// Placeholder while we figure out the best way to get all data
const useServerData = () => {
    const { currentServerId } = useUIStore();
    const { user } = useAuthStore();
    const queryClient = useQueryClient();

    const server = queryClient.getQueryData<Server>(['server', currentServerId]);
    const members = queryClient.getQueryData<ServerMember[]>(['members', currentServerId]);
    const roles = queryClient.getQueryData<Role[]>(['roles', currentServerId]);

    const myMember = members?.find(m => m.userId?._id === user?._id);

    return { server, myMember, roles };
}


/**
 * A hook to get the effective permissions of the current user for the current server.
 *
 * It calculates permissions based on the @everyone role and all roles assigned to the user.
 *
 * @returns A Set containing the user's effective permission strings for the server.
 */
export const useServerPermissions = (): Set<string> => {
    const { server, myMember, roles } = useServerData();

    const permissions = useMemo(() => {
        if (!server || !myMember || !roles) {
            return new Set<string>();
        }

        // Server owner has all permissions implicitly
        if (myMember.isOwner) {
            // In a real scenario, you might return a special symbol or all known permissions
            // For now, we'll just grant a set of admin-like perms for UI logic.
            return new Set<string>(['ADMINISTRATOR']); // Using a single 'ADMINISTRATOR' perm to signify full power
        }

        const everyoneRole = roles.find(r => r._id === server.everyoneRoleId);
        const memberRoles = roles.filter(r => myMember.roleIds.includes(r._id));

        const finalPermissions = new Set<string>(everyoneRole?.permissions || []);

        memberRoles.forEach(role => {
            role.permissions.forEach(perm => {
                finalPermissions.add(perm);
            });
        });

        return finalPermissions;

    }, [server, myMember, roles]);

    return permissions;
};