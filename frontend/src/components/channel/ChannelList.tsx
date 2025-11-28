import React from 'react';

const ChannelList: React.FC = () => {
  return (
    <div className="flex-1 p-2 overflow-y-auto">
      <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-2">Channels</h2>
      {/* Static example channels */}
      <div className="space-y-1">
        <div className="p-2 rounded hover:bg-gray-400 dark:hover:bg-gray-600 cursor-pointer"># general</div>
        <div className="p-2 rounded hover:bg-gray-400 dark:hover:bg-gray-600 cursor-pointer"># announcements</div>
        <div className="p-2 rounded bg-gray-500 dark:bg-gray-600 text-white cursor-pointer"># random</div>
      </div>
    </div>
  );
};

export default ChannelList;
