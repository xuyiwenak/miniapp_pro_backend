import { z } from 'zod';

export const schema = z.object({
  appenders: z.object({
    server: z.object({
      filename: z.string(),
      type: z.string(),
      numBackups: z.number(),
      encoding: z.string(),
      layout: z.object({ type: z.string(), pattern: z.string() }),
      pattern: z.string(),
      keepFileExt: z.boolean(),
      alwaysIncludePattern: z.boolean(),
    }),
    game: z.object({
      filename: z.string(),
      type: z.string(),
      numBackups: z.number(),
      encoding: z.string(),
      layout: z.object({ type: z.string(), pattern: z.string() }),
      pattern: z.string(),
      keepFileExt: z.boolean(),
      alwaysIncludePattern: z.boolean(),
    }),
    console: z.object({
      type: z.string(),
      layout: z.object({ type: z.string(), pattern: z.string() }),
    }),
    csv: z.object({
      filename: z.string(),
      type: z.string(),
      numBackups: z.number(),
      encoding: z.string(),
      layout: z.object({ type: z.string(), pattern: z.string() }),
      header: z.array(z.string()),
      pattern: z.string(),
      keepFileExt: z.boolean(),
      alwaysIncludePattern: z.boolean(),
    }),
    prop_history_csv: z.object({
      filename: z.string(),
      type: z.string(),
      numBackups: z.number(),
      encoding: z.string(),
      layout: z.object({ type: z.string() }),
      header: z.array(z.string()),
      pattern: z.string(),
      keepFileExt: z.boolean(),
      alwaysIncludePattern: z.boolean(),
    }),
  }),
  categories: z.object({
    default: z.object({
      appenders: z.array(z.string()),
      enableCallStack: z.boolean(),
      level: z.string(),
    }),
    server: z.object({
      appenders: z.array(z.string()),
      enableCallStack: z.boolean(),
      level: z.string(),
    }),
    game: z.object({
      appenders: z.array(z.string()),
      enableCallStack: z.boolean(),
      level: z.string(),
    }),
    csv: z.object({
      appenders: z.array(z.string()),
      enableCallStack: z.boolean(),
      level: z.string(),
    }),
    prop_history_csv: z.object({
      appenders: z.array(z.string()),
      enableCallStack: z.boolean(),
      level: z.string(),
    }),
  }),
});
