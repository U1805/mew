import React from 'react';
import { useUIStore } from '../../store';
import { ServerChannelList } from './ServerChannelList';
import { DMChannelList } from './DMChannelList';

const ChannelList: React.FC = () => {
  const { currentServerId } = useUIStore();

  return (
    <>
      {currentServerId ? <ServerChannelList /> : <DMChannelList />}
    </>
  );
};

export default ChannelList;