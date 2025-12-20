import React, { useMemo, useState } from 'react';
import { Role, ServerMember } from '../../../shared/types';
import { Icon } from '@iconify/react';
import clsx from 'clsx';

interface Props {
  roles: Role[];
  members: ServerMember[];
  existingTargetIds: string[];
  onSelect: (target: { targetId: string, targetType: 'role' | 'member' }) => void;
  onClose: () => void;
}

export const PermissionTargetSelector: React.FC<Props> = ({ roles, members, existingTargetIds, onSelect, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const selectableTargets = useMemo(() => {
    const existingIds = new Set(existingTargetIds);

    const availableRoles = roles
      .filter(r => !existingIds.has(r._id) && !r.isDefault) // Always exclude @everyone from being added manually
      .map(r => ({ id: r._id, name: r.name, color: r.color, type: 'role' as const }));

    const availableMembers = members
      .filter(m => !existingIds.has(m.userId._id))
      .map(m => ({ id: m.userId._id, name: m.userId.username, avatarUrl: m.userId.avatarUrl, type: 'member' as const }));

    const all = [...availableRoles, ...availableMembers];

    if (!searchTerm) {
      return all;
    }

    return all.filter(target => target.name.toLowerCase().includes(searchTerm.toLowerCase()));

  }, [roles, members, existingTargetIds, searchTerm]);

  const handleSelect = (target: { id: string, type: 'role' | 'member' }) => {
    onSelect({ targetId: target.id, targetType: target.type });
    onClose();
  }

  return (
    <div className="bg-[#313338] rounded-lg w-full max-w-md flex flex-col h-[500px]">
      <div className="p-4 border-b border-mew-divider flex-shrink-0">
        <h2 className="text-lg font-bold text-white mb-2">Add a Role or Member</h2>
        <div className="relative">
          <Icon icon="mdi:magnify" className="absolute left-2 top-1/2 -translate-y-1/2 text-mew-textMuted" />
          <input
            type="text"
            placeholder="Search roles and members..."
            className="w-full bg-[#202225] border-none rounded p-2 pl-8 text-white focus:outline-none focus:ring-1 focus:ring-mew-accent transition-all"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            autoFocus
          />
        </div>
      </div>

      <div className="flex-grow overflow-y-auto custom-scrollbar p-2">
        {selectableTargets.length > 0 ? selectableTargets.map(target => (
          <div
            key={`${target.type}-${target.id}`}
            className="flex items-center px-2 py-2 rounded cursor-pointer hover:bg-[#393C43]"
            onClick={() => handleSelect(target)}
          >
            {target.type === 'role' ? (
              <div className="w-5 h-5 rounded-full mr-3 flex-shrink-0 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: target.color || '#99AAB5' }}></div>
              </div>
            ) : (
              <div className="w-5 h-5 rounded-full bg-gray-600 mr-3 flex-shrink-0 overflow-hidden">
                {target.avatarUrl ? <img src={target.avatarUrl} className="w-full h-full object-cover"/> : <Icon icon="mdi:account" className="text-white"/>}
              </div>
            )}
            <span className={clsx("font-medium", target.type === 'role' && 'text-sm')} style={{ color: target.type === 'role' ? target.color : 'white' }}>
                {target.type === 'role' && '@'}{target.name}
            </span>
          </div>
        )) : (
            <div className="text-center text-mew-textMuted p-8">No roles or members to add.</div>
        )}
      </div>
    </div>
  );
};