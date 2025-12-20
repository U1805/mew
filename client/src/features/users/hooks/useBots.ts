import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { botApi } from '../../../shared/services/api';
import { Bot } from '../../../shared/types';
import toast from 'react-hot-toast';

export const useBots = () => {
  return useQuery({
    queryKey: ['bots'],
    queryFn: async () => {
      const res = await botApi.list();
      return res.data as Bot[];
    },
  });
};

export const useCreateBot = (onSuccessCallback?: (data: Bot) => void) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: FormData) => botApi.create(data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['bots'] });
      if (onSuccessCallback) {
        onSuccessCallback(response.data);
      } else {
        toast.success('Bot created successfully');
      }
    },
    onError: (error: any) => {
        toast.error(error.response?.data?.message || 'Failed to create bot');
    }
  });
};

export const useUpdateBot = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ botId, data }: { botId: string; data: FormData }) => 
      botApi.update(botId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bots'] });
      toast.success('Bot updated successfully');
    },
    onError: (error: any) => {
        toast.error(error.response?.data?.message || 'Failed to update bot');
    }
  });
};

export const useDeleteBot = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (botId: string) => botApi.delete(botId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bots'] });
      toast.success('Bot deleted successfully');
    },
    onError: (error: any) => {
        toast.error(error.response?.data?.message || 'Failed to delete bot');
    }
  });
};

export const useRegenerateBotToken = (onSuccessCallback?: (data: { accessToken: string }) => void) => {
    return useMutation({
        mutationFn: (botId: string) => botApi.regenerateToken(botId),
        onSuccess: (data) => {
            toast.success('Token regenerated');
            if (onSuccessCallback) {
                onSuccessCallback(data.data);
            }
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Failed to regenerate token');
        }
    });
};