import React from 'react';
import { DMChannelList } from './DMChannelList';
import { ServerChannelList } from './ServerChannelList';
import { useUIStore } from '../../../shared/stores';

const ChannelList: React.FC = () => {
  const { currentServerId } = useUIStore();

  return (
    // Mobile: fills remaining width of the fixed sidebar (320px - 70px server list)
    // Desktop: fixed width 17rem
    <div className="flex-1 md:w-[17rem] h-full flex flex-col bg-mew-darker border-r border-mew-darkest flex-shrink-0">
      {currentServerId ? <ServerChannelList /> : <DMChannelList />}
    </div>
  );
};

export default ChannelList;
