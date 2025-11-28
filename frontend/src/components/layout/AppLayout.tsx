import React from 'react';
import { Outlet } from 'react-router-dom';
import ServerList from '@/components/server/ServerList';
import ChannelList from '@/components/channel/ChannelList';
import UserPanel from '@/components/user/UserPanel';

const AppLayout: React.FC = () => {
  return (
    <div className="flex h-screen bg-gray-100 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      {/* Server List (Left Column) */}
      <div className="w-20 bg-gray-200 dark:bg-gray-800 p-2">
        <ServerList />
      </div>

      {/* Channel/Content Area (Middle Column) */}
      <div className="w-60 bg-gray-300 dark:bg-gray-700 flex flex-col">
        <ChannelList />
        <UserPanel />
      </div>

      {/* Main Content (Right Column) */}
      <div className="flex-1 p-4">
        <Outlet />
      </div>
    </div>
  );
};

export default AppLayout;
