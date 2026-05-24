import fs from 'fs';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { sendSucc, sendErr } from '../../../../../shared/miniapp/middleware/response';
import { loadSysConfigJson } from '../../../../../util/load_json';
import { resolveSysconfigJsonFile } from '../../../../../util/sysconfig_path';
import { envFirst } from '../../../../../util/env';

const router = Router();

const CONFIG_FILE = 'runtime_config.json';
const TAG_MAX_COUNT = 10;
const TAG_MAX_LENGTH = 10;

const PresetTagsSchema = z.object({
  tags: z
    .array(z.string().min(1, '标签不能为空').max(TAG_MAX_LENGTH, `标签最长 ${TAG_MAX_LENGTH} 个字`))
    .max(TAG_MAX_COUNT, `最多配置 ${TAG_MAX_COUNT} 个标签`),
});

function resolveConfigPath(): string {
  const environment = envFirst('environment', 'ENV') ?? 'development';
  const serverProvide = envFirst('serverProvide', 'SERVER_PROVIDE') ?? '';
  return resolveSysconfigJsonFile(environment, serverProvide, CONFIG_FILE);
}

/** GET /mandis-admin/preset-tags — 读取便签词汇配置 */
router.get('/', (_req: Request, res: Response) => {
  const [data] = loadSysConfigJson(CONFIG_FILE);
  const cfg = (data as Record<string, unknown>) ?? {};
  const tags = (cfg['preset_tags'] as string[] | undefined) ?? [];
  sendSucc(res, { tags });
});

/** PUT /mandis-admin/preset-tags — 更新便签词汇配置 */
router.put('/', (req: Request, res: Response) => {
  const parsed = PresetTagsSchema.safeParse(req.body);
  if (!parsed.success) {
    sendErr(res, parsed.error.issues.map((i) => i.message).join('; '), 400);
    return;
  }

  const { tags } = parsed.data;

  try {
    const filePath = resolveConfigPath();
    const [existing] = loadSysConfigJson(CONFIG_FILE);
    const merged = { ...(existing as Record<string, unknown>), preset_tags: tags };
    fs.writeFileSync(filePath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
    sendSucc(res, { tags });
  } catch (e) {
    sendErr(res, String(e), 500);
  }
});

export default router;
