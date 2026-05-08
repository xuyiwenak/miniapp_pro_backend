import { Router, type Response } from 'express';
import os from 'os';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { sendSucc, sendErr } from '../../../../../shared/miniapp/middleware/response';
import { requireSuperAdmin, type AdminRequest } from '../../middleware/adminAuth';
import { getHealDailyLimit, setHealDailyLimit } from '../../../../../auth/RedisTokenStore';
import { gameLogger as logger } from '../../../../../util/logger';

// ── App → Docker 映射 ────

const VALID_APPS = ['mandis', 'begreat'] as const;
type AppName = typeof VALID_APPS[number];

const APP_SERVICE: Record<AppName, string> = {
  mandis: 'mandis_app', begreat: 'begreat_app',
};
const APP_CONTAINER: Record<AppName, string> = {
  mandis: 'miniapp-mandis', begreat: 'miniapp-begreat',
};
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

/** 动态获取 nginx 容器名（可能带前缀如 bf2ad4a566ef_miniapp-nginx） */
function nginxContainerName(): string {
  return '$(docker ps --filter "name=nginx" --format "{{.Names}}" 2>/dev/null | head -1 || echo "miniapp-nginx")';
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

/** GET /admin/system/metrics */
router.get('/metrics', async (_req: AdminRequest, res: Response) => {
  try {
    const cpuUsage = await sampleCpuUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    sendSucc(res, {
      cpu: {
        usage: cpuUsage, cores: os.cpus().length,
        model: os.cpus()[0]?.model ?? 'Unknown', loadAvg: os.loadavg(),
      },
      memory: {
        total: totalMem, used: usedMem, free: freeMem,
        usagePercent: Math.round((usedMem / totalMem) * 1000) / 10,
      },
      system: {
        uptime: os.uptime(), uptimeStr: formatUptime(os.uptime()),
        nodeUptime: process.uptime(), nodeUptimeStr: formatUptime(process.uptime()),
        platform: os.platform(), hostname: os.hostname(),
      },
    });
  } catch (e) {
    logger.error('admin:system:metrics error', { error: (e as Error).message });
    sendErr(res, String(e), 500);
  }
});

/** GET /admin/system/containers */
router.get('/containers', (_req: AdminRequest, res: Response) => {
  exec('docker ps -a --format "{{json .}}"', { timeout: 10000 }, (err, stdout) => {
    if (err) {
      sendSucc(res, { containers: [], error: 'Docker unavailable: ' + err.message });
      return;
    }
    const containers = stdout.trim().split('\n').filter(Boolean)
      .map((line) => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);
    sendSucc(res, { containers });
  });
});

/** POST /admin/system/restart — 单容器重启 */
router.post('/restart', requireSuperAdmin, (req: AdminRequest, res: Response) => {
  const { name } = req.body as { name?: string };
  const allowed = ['miniapp-mandis', 'miniapp-begreat', 'miniapp-drawing',
    'miniapp-nginx', 'miniapp-mongo', 'miniapp-redis'];
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

/** POST /admin/system/app/restart — 普通重启（使用 docker compose） */
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
    `docker exec ${nginxContainerName()} nginx -s reload 2>/dev/null || true`,
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

/** POST /admin/system/app/build-restart — 编译重启（使用 docker compose） */
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
    `docker exec ${nginxContainerName()} nginx -s reload 2>/dev/null || true`,
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

/** POST /admin/system/app/stop — 停止容器（使用原生 docker 命令，无需 compose） */
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

/** GET /admin/system/app/log-files — 列出可用日志文件 */
router.get('/app/log-files', (_req: AdminRequest, res: Response) => {
  const logDir = path.join(process.cwd(), 'logs');
  try {
    if (!fs.existsSync(logDir)) { sendSucc(res, { files: [] }); return; }
    const raw = fs.readdirSync(logDir).filter((f) => f.endsWith('.log'));
    // 解析: {type}.{YYYY-MM-DD}.log
    const files = raw.map((name) => {
      const base = name.replace('.log', '');
      const lastDot = base.lastIndexOf('.');
      const type = lastDot > 0 ? base.substring(0, lastDot) : base;
      const date = lastDot > 0 ? base.substring(lastDot + 1) : '';
      const stat = fs.statSync(path.join(logDir, name));
      return { name, type, date, size: stat.size, mtime: stat.mtime.toISOString() };
    }).sort((a, b) => b.mtime.localeCompare(a.mtime)); // 最新在前
    sendSucc(res, { files });
  } catch (e) { sendErr(res, String(e), 500); }
});

/** GET /admin/system/app/logs — 支持指定文件或 docker logs */
router.get('/app/logs', (req: AdminRequest, res: Response) => {
  const app = (req.query.app as string) || '';
  if (!(VALID_APPS as readonly string[]).includes(app)) {
    sendErr(res, `Invalid app: must be one of ${VALID_APPS.join(', ')}`, 400);
    return;
  }
  const tail = Math.min(Math.max(parseInt(String(req.query.tail || '200'), 10) || 200, 50), 5000);
  const reqFile = (req.query.file as string) || ''; // 指定文件名，如 game.2026-05-08.log

  // 如果指定了文件，直接读文件
  if (reqFile && reqFile.endsWith('.log')) {
    const safeName = path.basename(reqFile);
    const logFile = path.join(process.cwd(), 'logs', safeName);
    exec(`tail -n ${tail} "${logFile}" 2>/dev/null`, { timeout: 10000 }, (err, stdout) => {
      const lines = (stdout || '').split('\n').filter((l) => l.trim() !== '');
      if (err || lines.length === 0) {
        sendSucc(res, { lines: [], tail, file: safeName, error: 'File empty or not found' });
      } else {
        sendSucc(res, { lines, tail, file: safeName });
      }
    });
    return;
  }

  // Step 1: 尝试 docker logs
  const cname = APP_CONTAINER[app as AppName];
  exec(`docker logs --tail=${tail} "${cname}" 2>&1`, { timeout: 15000 }, (err, stdout) => {
    const dockerLines = (stdout || '').split('\n').filter((l) => l.trim() !== '');
    if (!err && dockerLines.length > 0) {
      sendSucc(res, { lines: dockerLines, tail, source: 'docker' });
      return;
    }
    // Step 2: fallback — 今天的 game 日志
    const logDir = path.join(process.cwd(), 'logs');
    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(logDir, `game.${today}.log`);
    exec(`tail -n ${tail} "${logFile}" 2>/dev/null`, { timeout: 5000 }, (_err2, fileStdout) => {
      const fileLines = (fileStdout || '').split('\n').filter((l) => l.trim() !== '');
      sendSucc(res, { lines: fileLines, tail, source: 'file', file: path.basename(logFile) });
    });
  });
});

/** GET /admin/system/app/status — 使用 docker ps（无需 compose） */
router.get('/app/status', (_req: AdminRequest, res: Response) => {
  const svcList = Object.values(APP_SERVICE).join('|');
  // 直接用 docker ps 过滤
  const cmd = `docker ps -a --filter "name=${svcList}" --format "table {{.Names}}\\t{{.Image}}\\t{{.State}}\\t{{.Status}}\\t{{.Ports}}" 2>&1`;

  exec(cmd, { timeout: 10000 }, (err, stdout) => {
    if (err) {
      sendSucc(res, { lines: [], error: (err.message || '').slice(0, 1000) });
      return;
    }
    sendSucc(res, { lines: stdout.split('\n').filter(Boolean) });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Nginx 配置管理 API
// ──────────────────────────────────────────────────────────────────────────────

/** GET /admin/system/nginx-config — 列出或读取配置文件 */
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
    const safeName = path.basename(file);
    const filePath = path.join(confDir, safeName);
    if (!fs.existsSync(filePath)) { sendErr(res, `File not found: ${safeName}`, 404); return; }
    try {
      sendSucc(res, { file: safeName, content: fs.readFileSync(filePath, 'utf-8') });
    } catch (e) { sendErr(res, `Failed to read: ${(e as Error).message}`, 500); }
  } else {
    try {
      const files = fs.readdirSync(confDir).filter((f) => f.endsWith('.conf')).sort();
      sendSucc(res, { files, dir: confDir });
    } catch (e) { sendErr(res, `Failed to list: ${(e as Error).message}`, 500); }
  }
});

/** PUT /admin/system/nginx-config — 保存配置文件 */
router.put('/nginx-config', requireSuperAdmin, (req: AdminRequest, res: Response) => {
  const projectDir = resolveProject(res);
  if (!projectDir) return;
  const { file, content } = req.body as { file?: string; content?: string };
  if (!file || typeof content !== 'string') { sendErr(res, 'Missing file or content', 400); return; }
  const safeName = path.basename(file);
  if (!safeName.endsWith('.conf')) { sendErr(res, 'Only .conf files allowed', 400); return; }
  const filePath = path.join(projectDir, NGINX_CONF_DIR, safeName);
  const backupPath = filePath + '.bak.' + Date.now();
  try {
    if (fs.existsSync(filePath)) fs.copyFileSync(filePath, backupPath);
    fs.writeFileSync(filePath, content, 'utf-8');
    logger.info(`admin:system:nginx-config saved ${safeName}`);
    sendSucc(res, { file: safeName, saved: true, backup: path.basename(backupPath) });
  } catch (e) {
    sendErr(res, `Failed: ${(e as Error).message}`, 500);
  }
});

/** POST /admin/system/nginx-test — 使用 docker exec（无需 compose） */
router.post('/nginx-test', requireSuperAdmin, (_req: AdminRequest, res: Response) => {
  const cmd = `docker exec ${nginxContainerName()} nginx -t 2>&1`;
  exec(cmd, { timeout: 15000 }, (err, stdout, stderr) => {
    const output = (stdout + '\n' + stderr).trim();
    if (err) { sendSucc(res, { valid: false, output }); return; }
    sendSucc(res, { valid: true, output });
  });
});

/** POST /admin/system/nginx-reload — 使用 docker exec（无需 compose） */
router.post('/nginx-reload', requireSuperAdmin, (_req: AdminRequest, res: Response) => {
  const cmd = `docker exec ${nginxContainerName()} nginx -s reload 2>&1`;
  exec(cmd, { timeout: 15000 }, (err, stdout, stderr) => {
    if (err) { sendErr(res, (stderr || err.message).slice(0, 2000), 500); return; }
    sendSucc(res, { output: (stdout + '\n' + stderr).trim() || 'Nginx reloaded' });
  });
});

/** POST /admin/system/prune — 清理悬空镜像 */
router.post('/prune', requireSuperAdmin, (_req: AdminRequest, res: Response) => {
  exec('docker image prune -f', { timeout: 30000 }, (err, stdout, stderr) => {
    if (err) { sendErr(res, (stderr || err.message).slice(0, 2000), 500); return; }
    sendSucc(res, { output: (stdout + '\n' + stderr).trim() || 'Pruned' });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 旧端点保留
// ──────────────────────────────────────────────────────────────────────────────

router.post('/deploy', requireSuperAdmin, (_req: AdminRequest, res: Response) => {
  const projectDir = process.env.COMPOSE_PROJECT_DIR?.trim();
  if (!projectDir) { sendErr(res, 'COMPOSE_PROJECT_DIR not configured', 503); return; }
  const composeFile = path.join(projectDir, 'docker-compose.yml');
  if (!fs.existsSync(composeFile)) { sendErr(res, 'docker-compose.yml not found', 503); return; }
  const cmd = `docker compose -f "${composeFile}" --project-directory "${projectDir}" up -d --no-deps --build backend_app && docker image prune --force`;
  exec(cmd, { timeout: 300000, cwd: projectDir }, (err, stdout, stderr) => {
    if (err) { sendErr(res, (stderr || err.message).slice(0, 2000), 500); return; }
    sendSucc(res, { output: (stdout + '\n' + stderr).trim().slice(0, 5000) });
  });
});

router.get('/logs', (_req: AdminRequest, res: Response) => {
  const logDir = path.join(process.cwd(), 'logs');
  const today = new Date().toISOString().split('T')[0];
  const logFile = path.join(logDir, `game.${today}.log`);
  if (!fs.existsSync(logFile)) { sendSucc(res, { lines: [], file: logFile }); return; }
  exec(`tail -n 100 "${logFile}"`, { timeout: 5000 }, (err, stdout) => {
    if (err) { sendSucc(res, { lines: [], error: err.message }); return; }
    sendSucc(res, { lines: stdout.split('\n').filter(Boolean), file: logFile });
  });
});

router.get('/config', async (_req: AdminRequest, res: Response) => {
  try { sendSucc(res, { healDailyLimit: await getHealDailyLimit() }); }
  catch (e) { sendErr(res, String(e), 500); }
});

router.patch('/config', requireSuperAdmin, async (req: AdminRequest, res: Response) => {
  const { healDailyLimit } = req.body as { healDailyLimit?: unknown };
  if (typeof healDailyLimit !== 'number' || !Number.isInteger(healDailyLimit) || healDailyLimit < 0) {
    sendErr(res, 'healDailyLimit must be a non-negative integer', 400); return;
  }
  try { await setHealDailyLimit(healDailyLimit); sendSucc(res, { healDailyLimit }); }
  catch (e) { sendErr(res, String(e), 500); }
});

export default router;
