import fs from 'fs';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { sendSucc, sendErr } from '../../../../../shared/miniapp/middleware/response';
import { loadSysConfigJson } from '../../../../../util/load_json';
import { resolveSysconfigJsonFile } from '../../../../../util/sysconfig_path';
import { envFirst } from '../../../../../util/env';

const router = Router();

const CONFIG_FILE = 'runtime_config.json';

const MiniappConfigSchema = z.object({
  baseUrl: z.string().url('必须是合法的 URL'),
});

type MiniappConfig = z.infer<typeof MiniappConfigSchema>;

function resolveConfigPath(): string {
  const environment = envFirst('environment', 'ENV') ?? 'development';
  const serverProvide = envFirst('serverProvide', 'SERVER_PROVIDE') ?? '';
  return resolveSysconfigJsonFile(environment, serverProvide, CONFIG_FILE);
}

/** GET /mandis-admin/miniapp-config — 读取小程序域名配置 */
router.get('/', (_req: Request, res: Response) => {
  const [data] = loadSysConfigJson(CONFIG_FILE);
  const cfg = (data as Record<string, unknown>) ?? {};
  sendSucc(res, { baseUrl: (cfg['base_url'] as string) ?? '' });
});

/** PUT /mandis-admin/miniapp-config — 更新小程序域名配置（热生效，无需重启） */
router.put('/', (req: Request, res: Response) => {
  const parsed = MiniappConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    sendErr(res, parsed.error.issues.map((i) => i.message).join('; '), 400);
    return;
  }

  const { baseUrl }: MiniappConfig = parsed.data;

  try {
    const filePath = resolveConfigPath();
    const [existing] = loadSysConfigJson(CONFIG_FILE);
    const merged = { ...(existing as Record<string, unknown>), base_url: baseUrl };
    fs.writeFileSync(filePath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
    sendSucc(res, { baseUrl });
  } catch (e) {
    sendErr(res, String(e), 500);
  }
});

export default router;
