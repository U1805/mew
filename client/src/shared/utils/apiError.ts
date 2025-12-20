import axios from 'axios';

export const getApiErrorMessage = (error: unknown, fallback = 'An error occurred') => {
  if (axios.isAxiosError(error)) {
    const data: any = error.response?.data;

    if (typeof data === 'string' && data.trim()) return data;
    if (typeof data?.message === 'string' && data.message.trim()) return data.message;

    if (Array.isArray(data) && typeof data[0]?.message === 'string') return data[0].message;
    if (Array.isArray(data?.errors) && typeof data.errors[0]?.message === 'string') return data.errors[0].message;

    if (typeof error.message === 'string' && error.message.trim()) return error.message;
    return fallback;
  }

  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
};

