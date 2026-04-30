import { z } from 'zod';

export const schema = z.object({
  RegisterServerUrl: z.string(),
  version: z.number(),
  front_1: z.object({ zoneList: z.array(z.string()) }),
  front_2: z.object({ zoneList: z.array(z.string()) }),
  front_3: z.object({ zoneList: z.array(z.string()) }),
  group: z.object({
    1: z.object({ front: z.string(), logic: z.string() }),
    2: z.object({ front: z.string(), logic: z.string() }),
    3: z.object({ front: z.string(), logic: z.string() }),
  }),
});
