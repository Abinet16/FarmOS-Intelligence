import { ROLES } from '@farmos/shared-types';
import { z } from 'zod';

const role = z.enum(ROLES);

export const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role,
});
export type AddMemberDto = z.infer<typeof addMemberSchema>;

export const updateMemberSchema = z.object({ role });
export type UpdateMemberDto = z.infer<typeof updateMemberSchema>;
