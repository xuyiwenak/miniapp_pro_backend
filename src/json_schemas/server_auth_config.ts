import { z } from 'zod';

export const schema = z.object({
  internal_server_token: z.string(),
  account_server_token: z.string(),
});
