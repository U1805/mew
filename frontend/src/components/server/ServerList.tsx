import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

interface Server {
  _id: string;
  name: string;
  avatarUrl?: string;
}

// This is the function that will be called by react-query
const fetchServers = async (): Promise<Server[]> => {
  const { data } = await api.get('/users/@me/servers');
  return data;
};

const ServerList: React.FC = () => {
  const { token } = useAuthStore();

  const { data: servers, isLoading, isError, error } = useQuery<Server[], Error>({
    queryKey: ['servers'],
    queryFn: fetchServers,
    enabled: !!token, // Only run the query if the user is logged in
  });

  if (isLoading) {
    return <div className="p-2 text-xs">Loading servers...</div>;
  }

  if (isError) {
    return <div className="p-2 text-xs text-red-500">Error: {error.message}</div>;
  }

  return (
    <div className="space-y-2">
      {servers?.map((server) => (
        <div key={server._id} className="w-12 h-12 bg-gray-500 rounded-full flex items-center justify-center cursor-pointer hover:rounded-2xl transition-all duration-200">
          {server.avatarUrl ? (
            <img src={server.avatarUrl} alt={server.name} className="w-full h-full rounded-full" />
          ) : (
            <span className="text-white font-bold text-lg">{server.name.charAt(0)}</span>
          )}
        </div>
      ))}
    </div>
  );
};

export default ServerList;
