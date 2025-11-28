import React from 'react';
import { useAuthStore } from '@/store/authStore';

const UserPanel: React.FC = () => {
  const { user } = useAuthStore();

  if (!user) {
    return null;
  }

  return (
    <div className="p-2 bg-gray-400 dark:bg-gray-800 flex items-center space-x-2">
      <img
        src={user.avatarUrl || `https://api.dicebear.com/8.x/micah/svg?seed=${user.username}`}
        alt={user.username}
        className="w-10 h-10 rounded-full"
      />
      <div>
        <p className="font-bold text-sm">{user.username}</p>
        <p className="text-xs text-gray-600 dark:text-gray-400">Online</p>
      </div>
    </div>
  );
};

export default UserPanel;
