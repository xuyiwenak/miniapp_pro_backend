import { z } from 'zod';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './webAuthPassword';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^1\d{10}$/;
const VERIFICATION_CODE_PATTERN = /^\d{6}$/;

export const EmailRegistrationSchema = z
  .object({
    email: z.string().trim().regex(EMAIL_PATTERN),
    emailCode: z.string().regex(VERIFICATION_CODE_PATTERN),
    password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
    phone: z.string().trim().regex(PHONE_PATTERN).optional(),
    phoneCode: z.string().regex(VERIFICATION_CODE_PATTERN).optional(),
  })
  .refine((value) => Boolean(value.phone) === Boolean(value.phoneCode), {
    message: 'Phone number and code must be supplied together',
  });
