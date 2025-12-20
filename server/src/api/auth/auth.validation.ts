import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    username: z.string().trim().min(3, 'Username must be at least 3 characters long').max(32, 'Username is too long'),
    email: z.string().trim().toLowerCase().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters long'),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().trim().toLowerCase().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
});
