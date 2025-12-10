import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useModalStore, useAuthStore } from '../../../shared/stores/store';
import { ServerMember, User } from '../../../shared/types';
import { useUIStore } from '../../../shared/stores/store';

interface MentionProps {
  userId: string;
}

export const Mention: React.FC<MentionProps> = ({ userId }) => {
  const { openModal } = useModalStore();
  const { user: currentUser } = useAuthStore();
  const { currentServerId } = useUIStore();
  const queryClient = useQueryClient();

  // Try to find the user in the server members cache first
  const members = queryClient.getQueryData<ServerMember[]>(['members', currentServerId]);
  const member = members?.find(m => m.userId?._id === userId);
  
  // If not in member list (e.g. DM or left server), try generic user cache or just fallback
  // For MVP, we primarily rely on the loaded server members context.
  
  const username = member?.userId?.username || userId;
  const isMe = currentUser?._id === userId;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Construct a partial user object to open the profile
    const targetUser: Partial<User> = member?.userId || { _id: userId, username: 'Unknown User', email: '', isBot: false, createdAt: '' };
    openModal('userProfile', { user: targetUser });
  };

  return (
    <span
      onClick={handleClick}
      className={clsx(
        "inline-flex items-center px-1 rounded-[3px] font-medium cursor-pointer transition-colors select-none mx-0.5 align-baseline",
        isMe 
          ? "bg-[#F0B232]/10 text-[#F0B232] hover:bg-[#F0B232]/20" 
          : "bg-[#5865F2]/10 text-[#5865F2] hover:bg-[#5865F2]/20"
      )}
    >
      @{username}
    </span>
  );
};