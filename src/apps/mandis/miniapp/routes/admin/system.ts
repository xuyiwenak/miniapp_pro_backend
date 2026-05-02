import { Router } from 'express';
import os from 'os';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { sendSucc, sendErr } from '../../../../../shared/miniapp/middleware/response';
import { requireSuperAdmin } from '../../middleware/adminAuth';
import type { AdminRequest } from '../../middleware/adminAuth';
import type { Response } from 'express';
import { getHealDailyLimit, setHealDailyLimit } from '../../../../../auth/RedisTokenStore';
import { gameLogger as logger } from '../../../../../util/logger';

/** 采样 200ms 计算 CPU 使用率 */
function sampleCpuUsage(): Promise<number> {
  return new Promise((resolve) => {
    const snap1 = os.cpus().map((c) => ({ ...c.times }));
    setTimeout(() => {
      const cpus2 = os.cpus();
      let idle = 0, total = 0;
      cpus2.forEach((cpu, i) => {
        const t1 = snap1[i];
        const t2 = cpu.times;
        const dIdle = t2.idle - t1.idle;
        const dTotal =
          (t2.user - t1.user) + (t2.nice - t1.nice) +
          (t2.sys - t1.sys) + (t2.irq - t1.irq) + dIdle;
        idle += dIdle;
        total += dTotal;
      });
      resolve(total > 0 ? Math.round((1 - idle / total) * 1000) / 10 : 0);
    }, 200);
  });
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}天 ${h}小时 ${m}分`;
}

const router = Router();

/** GET /admin/system/metrics — CPU / 内存 / 运行时间 */
router.get('/metrics', async (_req: AdminRequest, res: Response) => {
  try {
    const cpuUsage = await sampleCpuUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    sendSucc(res, {
      cpu: {
        usage: cpuUsage,
        cores: os.cpus().length,
        model: os.cpus()[0]?.model ?? 'Unknown',
        loadAvg: os.loadavg(),
      },
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        usagePercent: Math.round((usedMem / totalMem) * 1000) / 10,
      },
      system: {
        uptime: os.uptime(),
        uptimeStr: formatUptime(os.uptime()),
        nodeUptime: process.uptime(),
        nodeUptimeStr: formatUptime(process.uptime()),
        platform: os.platform(),
        hostname: os.hostname(),
      },
    });
  } catch (e) {
    logger.error('admin:system:metrics error', { error: (e as Error).message });
    sendErr(res, String(e), 500);
  }
});

/** GET /admin/system/containers — Docker 容器列表 */
router.get('/containers', (_req: AdminRequest, res: Response) => {
  exec('docker ps -a --format "{{json .}}"', { timeout: 10000 }, (err, stdout) => {
    if (err) {
      sendSucc(res, { containers: [], error: 'Docker unavailable: ' + err.message });
      return;
    }
    const containers = stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);
    sendSucc(res, { containers });
  });
});

/** POST /admin/system/restart — 重启容器（仅超级管理员） */
router.post('/restart', requireSuperAdmin, (req: AdminRequest, res: Response) => {
  const { name } = req.body as { name?: string };
  const allowed = ['miniapp-backend', 'miniapp-nginx', 'miniapp-mongo', 'miniapp-redis'];
  if (!name || !allowed.includes(name)) {
    sendErr(res, 'Invalid container name', 400);
    return;
  }
  exec(`docker restart ${name}`, { timeout: 30000 }, (err, stdout, stderr) => {
    if (err) { sendErr(res, stderr || err.message, 500); return; }
    sendSucc(res, { output: stdout.trim() || `${name} restarted` });
  });
});

/** POST /admin/system/deploy — 构建并重部署 backend_app（仅超级管理员）
 *  需要环境变量 COMPOSE_PROJECT_DIR 指向宿主机项目根目录（挂载为 /workspace）
 *  且容器需挂载 /var/run/docker.sock
 */
router.post('/deploy', requireSuperAdmin, (_req: AdminRequest, res: Response) => {
  const projectDir = process.env.COMPOSE_PROJECT_DIR?.trim();
  if (!projectDir) {
    sendErr(res, 'COMPOSE_PROJECT_DIR not configured. Mount project dir and set env var.', 503);
    return;
  }
  const composeFile = path.join(projectDir, 'docker-compose.yml');
  if (!fs.existsSync(composeFile)) {
    sendErr(res, `docker-compose.yml not found at ${composeFile}`, 503);
    return;
  }
  const cmd = [
    `docker compose -f "${composeFile}" --project-directory "${projectDir}"`,
    'up -d --no-deps --build backend_app',
    '&& docker image prune --force',
  ].join(' ');

  // 构建最多等待 5 分钟
  exec(cmd, { timeout: 300000, cwd: projectDir }, (err, stdout, stderr) => {
    if (err) {
      sendErr(res, (stderr || err.message).slice(0, 2000), 500);
      return;
    }
    sendSucc(res, { output: (stdout + '\n' + stderr).trim().slice(0, 5000) });
  });
});

/** GET /admin/system/logs — 读取最近 100 行应用日志 */
router.get('/logs', (_req: AdminRequest, res: Response) => {
  const logDir = path.join(process.cwd(), 'logs');
  const today = new Date().toISOString().split('T')[0];
  const logFile = path.join(logDir, `game.${today}.log`);
  if (!fs.existsSync(logFile)) {
    sendSucc(res, { lines: [], file: logFile });
    return;
  }
  exec(`tail -n 100 "${logFile}"`, { timeout: 5000 }, (err, stdout) => {
    if (err) { sendSucc(res, { lines: [], error: err.message }); return; }
    sendSucc(res, { lines: stdout.split('\n').filter(Boolean), file: logFile });
  });
});

/** GET /admin/system/config — 读取系统配置 */
router.get('/config', async (_req: AdminRequest, res: Response) => {
  try {
    const healDailyLimit = await getHealDailyLimit();
    sendSucc(res, { healDailyLimit });
  } catch (e) {
    logger.error('admin:system:getConfig error', { error: (e as Error).message });
    sendErr(res, String(e), 500);
  }
});

/** PATCH /admin/system/config — 修改系统配置（仅超级管理员） */
router.patch('/config', requireSuperAdmin, async (req: AdminRequest, res: Response) => {
  const { healDailyLimit } = req.body as { healDailyLimit?: unknown };
  if (typeof healDailyLimit !== 'number' || !Number.isInteger(healDailyLimit) || healDailyLimit < 0) {
    sendErr(res, 'healDailyLimit must be a non-negative integer', 400);
    return;
  }
  try {
    await setHealDailyLimit(healDailyLimit);
    sendSucc(res, { healDailyLimit });
  } catch (e) {
    logger.error('admin:system:updateConfig error', { healDailyLimit, error: (e as Error).message });
    sendErr(res, String(e), 500);
  }
});

export default router;
