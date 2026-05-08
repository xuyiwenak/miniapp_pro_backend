import { Router, type Response } from 'express';
import os from 'os';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { sendSucc, sendErr } from '../../../../../shared/miniapp/middleware/response';
import { requireSuperAdmin, type AdminRequest } from '../../middleware/adminAuth';
import { getHealDailyLimit, setHealDailyLimit } from '../../../../../auth/RedisTokenStore';
import { gameLogger as logger } from '../../../../../util/logger';

// ── App → Docker Compose 映射（与 docker-compose.yml container_name / service 一致）────

const VALID_APPS = ['mandis', 'begreat'] as const;
type AppName = typeof VALID_APPS[number];

const APP_SERVICE: Record<AppName, string> = {
  mandis: 'mandis_app',
  begreat: 'begreat_app',
};

const APP_CONTAINER: Record<AppName, string> = {
  mandis: 'miniapp-mandis',
  begreat: 'miniapp-begreat',
};

/** Nginx 配置目录（相对于 COMPOSE_PROJECT_DIR） */
const NGINX_CONF_DIR = 'nginx/conf.d';

// ── helpers ──

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

function parseApp(body: Record<string, unknown>, res: Response): AppName | null {
  const app = body.app as string | undefined;
  if (!app || !(VALID_APPS as readonly string[]).includes(app)) {
    sendErr(res, `Invalid app: must be one of ${VALID_APPS.join(', ')}`, 400);
    return null;
  }
  return app as AppName;
}

function resolveProject(res: Response): string | null {
  const projectDir = process.env.COMPOSE_PROJECT_DIR?.trim();
  if (!projectDir) {
    sendErr(res, 'COMPOSE_PROJECT_DIR not configured', 503);
    return null;
  }
  const composeFile = path.join(projectDir, 'docker-compose.yml');
  if (!fs.existsSync(composeFile)) {
    sendErr(res, `docker-compose.yml not found at ${composeFile}`, 503);
    return null;
  }
  return projectDir;
}

function composeCmd(projectDir: string, subCmd: string): string {
  const composeFile = path.join(projectDir, 'docker-compose.yml');
  return `docker compose -f "${composeFile}" --project-directory "${projectDir}" ${subCmd}`;
}

function forceKillContainerCmd(cname: string): string {
  return [
    `pid=$(docker inspect --format '{{.State.Pid}}' "${cname}" 2>/dev/null || echo 0)`,
    'if [ "$pid" -gt 0 ]; then',
    '  kill -9 "$pid" 2>/dev/null || true',
    '  for i in $(seq 1 10); do',
    `    state=$(docker inspect --format '{{.State.Status}}' "${cname}" 2>/dev/null || echo "gone")`,
    '    [ "$state" != "running" ] && break',
    '    sleep 0.5',
    '  done',
    'fi',
    `docker rm "${cname}" 2>/dev/null || true`,
  ].join('\n');
}

// ── router ──

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
  const allowed = [
    'miniapp-mandis', 'miniapp-begreat', 'miniapp-drawing',
    'miniapp-nginx', 'miniapp-mongo', 'miniapp-redis',
  ];
  if (!name || !allowed.includes(name)) {
    sendErr(res, 'Invalid container name', 400);
    return;
  }
  exec(`docker restart ${name}`, { timeout: 30000 }, (err, stdout, stderr) => {
    if (err) { sendErr(res, stderr || err.message, 500); return; }
    sendSucc(res, { output: stdout.trim() || `${name} restarted` });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 服务器控制台 API
// ──────────────────────────────────────────────────────────────────────────────

/** POST /admin/system/app/restart — 普通重启 */
router.post('/app/restart', requireSuperAdmin, (req: AdminRequest, res: Response) => {
  const app = parseApp(req.body as Record<string, unknown>, res);
  if (!app) return;
  const projectDir = resolveProject(res);
  if (!projectDir) return;

  const svc = APP_SERVICE[app];
  const cname = APP_CONTAINER[app];
  const cmd = [
    forceKillContainerCmd(cname),
    composeCmd(projectDir, `up -d --force-recreate --no-deps ${svc}`),
    composeCmd(projectDir, 'exec -T nginx nginx -s reload || true'),
  ].join('\n');

  logger.info(`admin:system:app/restart ${app}`, { svc, cname });
  exec(cmd, { timeout: 120000, cwd: projectDir }, (err, stdout, stderr) => {
    if (err) {
      logger.error(`admin:system:app/restart ${app} failed`, { error: (stderr || err.message).slice(0, 500) });
      sendErr(res, (stderr || err.message).slice(0, 2000), 500);
      return;
    }
    sendSucc(res, { output: (stdout + '\n' + stderr).trim().slice(0, 5000) });
  });
});

/** POST /admin/system/app/build-restart — 编译代码并重启 */
router.post('/app/build-restart', requireSuperAdmin, (req: AdminRequest, res: Response) => {
  const app = parseApp(req.body as Record<string, unknown>, res);
  if (!app) return;
  const noCache = (req.body as { noCache?: boolean }).noCache === true;
  const projectDir = resolveProject(res);
  if (!projectDir) return;

  const svc = APP_SERVICE[app];
  const cname = APP_CONTAINER[app];
  const noCacheFlag = noCache ? '--no-cache' : '';
  const cmd = [
    forceKillContainerCmd(cname),
    composeCmd(projectDir, `build ${noCacheFlag} begreat_app`),
    composeCmd(projectDir, `up -d --force-recreate --no-deps ${svc}`),
    composeCmd(projectDir, 'exec -T nginx nginx -s reload || true'),
  ].join('\n');

  logger.info(`admin:system:app/build-restart ${app} noCache=${noCache}`, { svc, cname });
  exec(cmd, { timeout: 480000, cwd: projectDir }, (err, stdout, stderr) => {
    if (err) {
      logger.error(`admin:system:app/build-restart ${app} failed`, { error: (stderr || err.message).slice(0, 500) });
      sendErr(res, (stderr || err.message).slice(0, 2000), 500);
      return;
    }
    sendSucc(res, { output: (stdout + '\n' + stderr).trim().slice(0, 8000) });
  });
});

/** POST /admin/system/app/stop — 停止 app 容器 */
router.post('/app/stop', requireSuperAdmin, (req: AdminRequest, res: Response) => {
  const app = parseApp(req.body as Record<string, unknown>, res);
  if (!app) return;
  const cname = APP_CONTAINER[app];
  const cmd = forceKillContainerCmd(cname);

  logger.info(`admin:system:app/stop ${app}`, { cname });
  exec(cmd, { timeout: 30000 }, (err, stdout, stderr) => {
    if (err) {
      logger.error(`admin:system:app/stop ${app} failed`, { error: (stderr || err.message).slice(0, 500) });
      sendErr(res, (stderr || err.message).slice(0, 2000), 500);
      return;
    }
    sendSucc(res, { output: (stdout + '\n' + stderr).trim() || `${cname} stopped` });
  });
});

/** GET /admin/system/app/logs — 获取 docker compose 日志 */
router.get('/app/logs', (req: AdminRequest, res: Response) => {
  const app = (req.query.app as string) || '';
  if (!(VALID_APPS as readonly string[]).includes(app)) {
    sendErr(res, `Invalid app: must be one of ${VALID_APPS.join(', ')}`, 400);
    return;
  }
  const tail = Math.min(Math.max(parseInt(String(req.query.tail || '100'), 10) || 100, 10), 1000);
  const projectDir = resolveProject(res);
  if (!projectDir) return;

  const svc = APP_SERVICE[app as AppName];
  const cmd = composeCmd(projectDir, `logs --tail=${tail} ${svc}`);
  exec(cmd, { timeout: 15000, cwd: projectDir }, (err, stdout, stderr) => {
    if (err) {
      sendSucc(res, { lines: [], error: (stderr || err.message).slice(0, 1000) });
      return;
    }
    sendSucc(res, { lines: stdout.split('\n').filter(Boolean), tail });
  });
});

/** GET /admin/system/app/status — 获取容器运行状态 */
router.get('/app/status', (_req: AdminRequest, res: Response) => {
  const projectDir = resolveProject(res);
  if (!projectDir) return;
  const svcList = Object.values(APP_SERVICE).join(' ');
  const cmd = composeCmd(projectDir, `ps ${svcList}`);
  exec(cmd, { timeout: 10000, cwd: projectDir }, (err, stdout, stderr) => {
    if (err) {
      sendSucc(res, { lines: [], error: (stderr || err.message).slice(0, 1000) });
      return;
    }
    sendSucc(res, { lines: stdout.split('\n').filter(Boolean) });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Nginx 配置管理 API
// ──────────────────────────────────────────────────────────────────────────────

/** GET /admin/system/nginx-config — 列出所有配置文件或读取单个文件内容 */
router.get('/nginx-config', (req: AdminRequest, res: Response) => {
  const projectDir = resolveProject(res);
  if (!projectDir) return;

  const confDir = path.join(projectDir, NGINX_CONF_DIR);
  if (!fs.existsSync(confDir)) {
    sendErr(res, `Nginx conf dir not found: ${confDir}`, 503);
    return;
  }

  const file = req.query.file as string | undefined;

  if (file) {
    // 读取单个文件
    const safeName = path.basename(file); // 防目录穿越
    const filePath = path.join(confDir, safeName);
    if (!fs.existsSync(filePath)) {
      sendErr(res, `File not found: ${safeName}`, 404);
      return;
    }
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      sendSucc(res, { file: safeName, content });
    } catch (e) {
      sendErr(res, `Failed to read ${safeName}: ${(e as Error).message}`, 500);
    }
  } else {
    // 列出所有 .conf 文件
    try {
      const files = fs.readdirSync(confDir)
        .filter((f) => f.endsWith('.conf'))
        .sort();
      sendSucc(res, { files, dir: confDir });
    } catch (e) {
      sendErr(res, `Failed to list conf dir: ${(e as Error).message}`, 500);
    }
  }
});

/** PUT /admin/system/nginx-config — 保存单个配置文件（仅超级管理员） */
router.put('/nginx-config', requireSuperAdmin, (req: AdminRequest, res: Response) => {
  const projectDir = resolveProject(res);
  if (!projectDir) return;

  const { file, content } = req.body as { file?: string; content?: string };
  if (!file || typeof content !== 'string') {
    sendErr(res, 'Missing file or content', 400);
    return;
  }

  const safeName = path.basename(file);
  if (!safeName.endsWith('.conf')) {
    sendErr(res, 'Only .conf files allowed', 400);
    return;
  }

  const confDir = path.join(projectDir, NGINX_CONF_DIR);
  const filePath = path.join(confDir, safeName);

  // 先备份
  const backupPath = filePath + '.bak.' + Date.now();
  try {
    if (fs.existsSync(filePath)) {
      fs.copyFileSync(filePath, backupPath);
    }
    fs.writeFileSync(filePath, content, 'utf-8');
    logger.info(`admin:system:nginx-config saved ${safeName}`, { backup: backupPath });
    sendSucc(res, { file: safeName, saved: true, backup: path.basename(backupPath) });
  } catch (e) {
    logger.error(`admin:system:nginx-config save ${safeName} failed`, { error: (e as Error).message });
    sendErr(res, `Failed to save ${safeName}: ${(e as Error).message}`, 500);
  }
});

/** POST /admin/system/nginx-test — 测试 Nginx 配置语法 */
router.post('/nginx-test', requireSuperAdmin, (_req: AdminRequest, res: Response) => {
  const projectDir = resolveProject(res);
  if (!projectDir) return;

  const cmd = composeCmd(projectDir, 'exec -T nginx nginx -t');
  exec(cmd, { timeout: 15000, cwd: projectDir }, (err, stdout, stderr) => {
    // nginx -t 即使成功也可能输出到 stderr
    const output = (stdout + '\n' + stderr).trim();
    if (err) {
      sendSucc(res, { valid: false, output });
      return;
    }
    sendSucc(res, { valid: true, output });
  });
});

/** POST /admin/system/nginx-reload — 重载 Nginx 配置 */
router.post('/nginx-reload', requireSuperAdmin, (_req: AdminRequest, res: Response) => {
  const projectDir = resolveProject(res);
  if (!projectDir) return;

  const cmd = composeCmd(projectDir, 'exec -T nginx nginx -s reload');
  exec(cmd, { timeout: 15000, cwd: projectDir }, (err, stdout, stderr) => {
    if (err) {
      sendErr(res, (stderr || err.message).slice(0, 2000), 500);
      return;
    }
    sendSucc(res, { output: (stdout + '\n' + stderr).trim() || 'Nginx reloaded' });
  });
});

/** POST /admin/system/prune — 清理悬空镜像 */
router.post('/prune', requireSuperAdmin, (_req: AdminRequest, res: Response) => {
  exec('docker image prune -f', { timeout: 30000 }, (err, stdout, stderr) => {
    if (err) {
      sendErr(res, (stderr || err.message).slice(0, 2000), 500);
      return;
    }
    sendSucc(res, { output: (stdout + '\n' + stderr).trim() || 'Pruned' });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 已有端点（保留）
// ──────────────────────────────────────────────────────────────────────────────

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
  exec(cmd, { timeout: 300000, cwd: projectDir }, (err, stdout, stderr) => {
    if (err) {
      sendErr(res, (stderr || err.message).slice(0, 2000), 500);
      return;
    }
    sendSucc(res, { output: (stdout + '\n' + stderr).trim().slice(0, 5000) });
  });
});

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

router.get('/config', async (_req: AdminRequest, res: Response) => {
  try {
    const healDailyLimit = await getHealDailyLimit();
    sendSucc(res, { healDailyLimit });
  } catch (e) {
    logger.error('admin:system:getConfig error', { error: (e as Error).message });
    sendErr(res, String(e), 500);
  }
});

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
