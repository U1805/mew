import React from 'react';
import { DMChannelList } from './DMChannelList';
import { ServerChannelList } from './ServerChannelList';
import { useUIStore } from '../../../shared/stores';

const ChannelList: React.FC = () => {
  const { currentServerId } = useUIStore();

  return (
    <>
      {currentServerId ? <ServerChannelList /> : <DMChannelList />}
    </>
  );
};

export default ChannelList;
