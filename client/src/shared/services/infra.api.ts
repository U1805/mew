import api from './http';

export type AvailableService = {
  serviceType: string;
  serverName?: string;
  icon?: string;
  description?: string;
  configTemplate?: string;
  online: boolean;
  connections: number;
};

export const infraApi = {
  availableServices: (opts?: { includeOffline?: boolean }) =>
    api.get('/infra/available-services', {
      params: opts?.includeOffline ? { includeOffline: 1 } : undefined,
    }),
  serviceBotUser: (serviceType: string) =>
    api.get('/infra/service-bot-user', {
      params: { serviceType },
    }),
};

export default infraApi;

