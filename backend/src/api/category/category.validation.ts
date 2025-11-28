import { z } from 'zod';

export const createCategorySchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
  }),
  params: z.object({
    serverId: z.string(),
  }),
});

export const updateCategorySchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    position: z.number().optional(),
  }),
  params: z.object({
    categoryId: z.string(),
  }),
});

export const categoryIdParams = z.object({
  params: z.object({
    categoryId: z.string(),
  }),
});
