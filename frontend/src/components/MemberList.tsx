import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { serverApi } from '../services/api';
import { useUIStore } from '../store';
import { User } from '../types';
import { Icon } from '@iconify/react';
import clsx from 'clsx';

const MemberList: React.FC = () => {
  const { currentServerId } = useUIStore();

  const { data: members, isLoading } = useQuery({
    queryKey: ['members', currentServerId],
    queryFn: async () => {
      if (!currentServerId) return [];
      // In a real implementation, we would call serverApi.getMembers(currentServerId)
      // Since that endpoint might be mock, we can try to fetch the server details which might contain members
      // OR mock it for now if the backend isn't ready. 
      // Let's assume serverApi.getMembers returns a list of Users.
      try {
          const res = await serverApi.getMembers(currentServerId);
          return res.data as User[];
      } catch (e) {
          console.warn("Member list fetch failed, using fallback/mock or empty", e);
          return [];
      }
    },
    enabled: !!currentServerId
  });

  if (!currentServerId) return null;

  // Mock grouping - In real app, rely on presence system
  const onlineMembers = members?.filter((_, i) => i % 2 === 0) || [];
  const offlineMembers = members?.filter((_, i) => i % 2 !== 0) || [];

  return (
    <div className="w-60 bg-[#2B2D31] flex flex-col flex-shrink-0 h-full overflow-y-auto custom-scrollbar p-3">
      {isLoading ? (
          <div className="flex justify-center mt-10">
             <Icon icon="mdi:loading" className="animate-spin text-mew-textMuted" />
          </div>
      ) : (
          <>
            <MemberGroup title={`Online — ${onlineMembers.length}`} members={onlineMembers} />
            <MemberGroup title={`Offline — ${offlineMembers.length}`} members={offlineMembers} isOffline />
          </>
      )}
    </div>
  );
};

const MemberGroup = ({ title, members, isOffline }: { title: string, members: User[], isOffline?: boolean }) => {
    if (members.length === 0) return null;
    return (
        <div className="mb-6">
            <h3 className="text-xs font-bold text-mew-textMuted uppercase mb-2 px-2">{title}</h3>
            {members.map(member => (
                <div key={member._id} className={clsx("flex items-center px-2 py-1.5 rounded hover:bg-[#35373C] cursor-pointer group", isOffline && "opacity-50 hover:opacity-100")}>
                    <div className="relative mr-3">
                        <div className="w-8 h-8 rounded-full bg-mew-accent flex items-center justify-center overflow-hidden">
                             {member.avatarUrl ? (
                                <img src={member.avatarUrl} alt={member.username} className="w-full h-full object-cover" />
                             ) : (
                                <span className="text-white text-xs font-bold">{member.username.substring(0, 2).toUpperCase()}</span>
                             )}
                        </div>
                        {/* Status Indicator */}
                        <div className={clsx(
                            "absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 border-[3px] border-[#2B2D31] rounded-full",
                            isOffline ? "bg-gray-400" : "bg-green-500"
                        )}></div>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className={clsx("font-medium text-sm truncate", isOffline ? "text-mew-textMuted group-hover:text-mew-text" : "text-white")}>
                            {member.username}
                        </div>
                        {member.isBot && (
                            <div className="text-[10px] font-bold text-white bg-[#5865F2] inline-block px-1 rounded-[3px] leading-3 mt-0.5">BOT</div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    )
}

export default MemberList;