import api from './http';

export type AvailableService = {
  serviceType: string;
  online: boolean;
  connections: number;
};

export const infraApi = {
  availableServices: () => api.get('/infra/available-services'),
};

export default infraApi;

