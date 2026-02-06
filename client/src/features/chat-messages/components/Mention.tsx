import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import type { MouseEvent } from 'react';
import { useModalStore, useUIStore } from '../../../shared/stores';
import { useAuthStore } from '../../../shared/stores/authStore';
import { ServerMember, User } from '../../../shared/types';

interface MentionProps {
  userId: string;
}

export const Mention = ({ userId }: MentionProps) => {
  const { openModal } = useModalStore();
  const { user: currentUser } = useAuthStore();
  const { currentServerId } = useUIStore();
  const queryClient = useQueryClient();

  const members = queryClient.getQueryData<ServerMember[]>(['members', currentServerId]);
  const member = members?.find(m => m.userId?._id === userId);
  
  const username = member?.userId?.username || userId;
  const isMe = currentUser?._id === userId;

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
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

