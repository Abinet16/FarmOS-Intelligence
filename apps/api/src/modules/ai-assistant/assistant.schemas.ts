import { MAX_QUESTION_LENGTH } from '@farmos/shared-types';
import { z } from 'zod';
import { pageQuery } from '../../common/query/pagination.js';

export const askSchema = z.object({
  question: z.string().trim().min(3).max(MAX_QUESTION_LENGTH),
});
export type AskDto = z.infer<typeof askSchema>;

export const listConversationsSchema = pageQuery;
export type ListConversationsQuery = z.infer<typeof listConversationsSchema>;
