import { z } from "zod";

const dbEntry = z.object({
  host: z.string(),
  port: z.number(),
  db: z.string(),
  user: z.string().optional(),
  password: z.string().optional(),
  authSource: z.string().optional(),
});

export const schema = z.object({
  db_global: dbEntry,
  db_server: z.object({
    front_1: dbEntry,
    front_2: dbEntry,
  }),
  db_zones: z.object({
    zone1: dbEntry,
    zone2: dbEntry,
  }),
  redis_global: z.object({
    host: z.string(),
    port: z.number(),
    db: z.number(),
  }),
});
