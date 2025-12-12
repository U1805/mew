import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ServerMember } from '../../../shared/types';

interface MentionSuggestionListProps {
  serverId: string;
  query: string;
  onSelect: (member: ServerMember) => void;
  onClose: () => void;
}

export const MentionSuggestionList = ({ serverId, query, onSelect, onClose }: MentionSuggestionListProps) => {
  const queryClient = useQueryClient();
  const [selectedIndex, setSelectedIndex] = useState(0);

  const members = queryClient.getQueryData<ServerMember[]>(['members', serverId]) || [];

  const filteredMembers = useMemo(() => {
    const lowerQuery = query.toLowerCase();
    const memberSuggestions = members
      .filter(m => m.userId && !m.userId.isBot && m.userId.username.toLowerCase().includes(lowerQuery));

    const globalSuggestions: (ServerMember & { isGlobal?: boolean })[] = [];
    if ('everyone'.includes(lowerQuery)) {
      globalSuggestions.push({ 
        _id: 'everyone', 
        isGlobal: true, 
        serverId, 
        userId: { _id: 'everyone', username: 'everyone' } as any,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
    if ('here'.includes(lowerQuery)) {
      globalSuggestions.push({ 
        _id: 'here', 
        isGlobal: true, 
        serverId, 
        userId: { _id: 'here', username: 'here' } as any,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    return [...globalSuggestions, ...memberSuggestions].slice(0, 10);
  }, [members, query, serverId]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (filteredMembers.length === 0) return;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : filteredMembers.length - 1));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev < filteredMembers.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        onSelect(filteredMembers[selectedIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [filteredMembers, selectedIndex, onSelect, onClose]);

  if (filteredMembers.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 mb-2 w-64 bg-[#2B2D31] rounded-md shadow-xl border border-[#1E1F22] overflow-hidden z-50">
      <div className="text-xs font-bold text-mew-textMuted uppercase px-3 py-2 bg-[#1E1F22]">
        Members
      </div>
      <div className="max-h-[200px] overflow-y-auto custom-scrollbar p-1">
        {filteredMembers.map((member, index) => (
          <div
            key={member._id}
            onClick={() => onSelect(member)}
            className={clsx(
              "flex items-center px-2 py-1.5 rounded cursor-pointer",
              index === selectedIndex ? "bg-[#404249] text-white" : "text-[#B5BAC1] hover:bg-[#35373C]"
            )}
          >
            {(member as any).isGlobal ? (
              <div className="w-6 h-6 rounded-full bg-mew-textMuted/40 flex items-center justify-center mr-2 flex-shrink-0">
                <span className="font-bold text-mew-accent">@</span>
              </div>
            ) : (
              <div className="w-6 h-6 rounded-full bg-mew-accent flex items-center justify-center mr-2 overflow-hidden flex-shrink-0">
                {member.userId.avatarUrl ? (
                    <img src={member.userId.avatarUrl} alt={member.userId.username} className="w-full h-full object-cover" />
                ) : (
                    <span className="text-[10px] font-bold text-white">{member.userId.username.substring(0, 2).toUpperCase()}</span>
                )}
              </div>
            )}
            <span className="truncate font-medium text-sm">{member.userId.username}</span>
            {(member as any).isGlobal ? (
                <span className="ml-2 text-xs text-mew-textMuted truncate">Notify everyone online or all members</span>
            ) : (
                <span className="ml-1 text-xs text-mew-textMuted">#{member.userId._id.slice(0, 4)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
