import { z } from 'zod';

import { ROLE } from './roles';
import { USER_STATUS } from './types';

/**
 * Request body schemas. Every mutation schema is `.strict()`: unknown keys are a
 * 400, so `{ fullName, role }` sent to the profile endpoint cannot sneak a role change in.
 */

const email = z.string().trim().toLowerCase().pipe(z.email({ message: 'Enter a valid email' }));
const fullName = z.string().trim().min(1, 'Name is required').max(100);
const id = z.string().trim().min(1);

export const loginSchema = z
  .object({
    email,
    password: z.string().min(1, 'Password is required'),
  })
  .strict();

export const createUserSchema = z
  .object({
    fullName,
    email,
    role: z.enum(ROLE),
    managerId: id.nullable().default(null),
    password: z.string().min(6, 'At least 6 characters').max(100),
  })
  .strict();

export const updateProfileSchema = z
  .object({
    fullName: fullName.optional(),
    email: email.optional(),
  })
  .strict()
  .refine((body) => body.fullName !== undefined || body.email !== undefined, {
    message: 'Send fullName and/or email',
  });

export const changeRoleSchema = z.object({ role: z.enum(ROLE) }).strict();

export const changeStatusSchema = z.object({ status: z.enum(USER_STATUS) }).strict();

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;
