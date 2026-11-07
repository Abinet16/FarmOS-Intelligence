import { z } from 'zod';

export const feedTypeSchema = z.object({
  name: z.string().trim().min(2).max(80),
});
export type FeedTypeDto = z.infer<typeof feedTypeSchema>;
