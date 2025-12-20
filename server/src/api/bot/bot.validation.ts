import { z } from 'zod';

const isJSON = (value: string) => {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
};


export const createBotSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters long').max(50, 'Name cannot exceed 50 characters'),
    serviceType: z.string().min(1, 'Service type is required'),
    dmEnabled: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),
    config: z.string().refine(isJSON, { message: 'Config must be a valid JSON string' }).optional(),
  })
});

export const updateBotSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters long').max(50, 'Name cannot exceed 50 characters').optional(),
    serviceType: z.string().min(1, 'Service type is required').optional(),
    dmEnabled: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),
    config: z.string().refine(isJSON, { message: 'Config must be a valid JSON string' }).optional(),
  })
});
