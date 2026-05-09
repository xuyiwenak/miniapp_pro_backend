/**
 * 服务器管理路由工厂
 * 被 mandis /admin/system 和 begreat /begreat-admin/system 同时挂载。
 * 写操作由调用方传入鉴权中间件（requirePrivileged）；读操作不做额外限制。
 */
import { Router, type Request, type Response, type RequestHandler } from 'express';
import os from 'os';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import Redis from 'ioredis';
import { ComponentManager, EComName } from '../../common/BaseComponent';
import { sendSucc, sendErr } from '../miniapp/middleware/response';
import { gameLogger as logger } from '../../util/logger';

// ── 常量 ─────────────────────────────────────────────────────────────────────

const VALID_APPS    = ['mandis', 'begreat'] as const;
const NGINX_CONF_DIR = 'nginx/conf.d';

type AppName = typeof VALID_APPS[number];

const APP_SERVICE: Record<AppName, string> = {
  mandis: 'mandis_app',
  begreat: 'begreat_app',
};
const APP_CONTAINER: Record<AppName, string> = {
  mandis: 'art-mandis',
  begreat: 'art-begreat',
};

// ── Runtime 配置 ──────────────────────────────────────────────────────────────

const RuntimeConfigSchema = z.object({
  appName:                  z.enum(VALID_APPS),
  label:                    z.string().min(1),
  systemApiBase:            z.string().startsWith('/'),
  dockerContainerName:      z.string().min(1),
  logAutoRefreshIntervalMs: z.number().int().positive(),
  containerRefreshDelayMs:  z.number().int().nonnegative(),
  defaultLogTail:           z.number().int().min(50).max(5000),
});

type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

const RUNTIME_CONFIG_DEFAULTS: Record<AppName, RuntimeConfig> = {
  mandis: {
    appName: 'mandis',
    label: 'Mandis 艺术工作室',
    systemApiBase: '/api/mandis-admin/system',
    dockerContainerName: 'art-mandis',
    logAutoRefreshIntervalMs: 10000,
    containerRefreshDelayMs: 3000,
    defaultLogTail: 200,
  },
  begreat: {
    appName: 'begreat',
    label: 'BeGreat 职业测评',
    systemApiBase: '/begreat-admin/system',
    dockerContainerName: 'art-begreat',
    logAutoRefreshIntervalMs: 10000,
    containerRefreshDelayMs: 3000,
    defaultLogTail: 200,
  },
};

const REDIS_KEY_PREFIX = 'commander:runtime-config';

let redisClient: Redis | null = null;

function getRedis(): Redis {
  if (redisClient) return redisClient;
  const sysCfg = ComponentManager.instance.getComponent(EComName.SysCfgComponent);
  const cfg = sysCfg.redis_global;
  if (!cfg) throw new Error('redis_global config is missing');
  redisClient = new Redis({
    host: cfg.host,
    port: cfg.port,
    db: cfg.db ?? 0,
    username: cfg.user,
    password: cfg.password,
  });
  return redisClient;
}

async function readRuntimeConfig(appName: AppName): Promise<RuntimeConfig> {
  try {
    const raw = await getRedis().get(`${REDIS_KEY_PREFIX}:${appName}`);
    if (raw) {
      const parsed = RuntimeConfigSchema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    }
  } catch { /* fall through */ }
  return RUNTIME_CONFIG_DEFAULTS[appName];
}

async function writeRuntimeConfig(config: RuntimeConfig): Promise<void> {
  await getRedis().set(`${REDIS_KEY_PREFIX}:${config.appName}`, JSON.stringify(config));
}

// ── 纯函数工具 ───────────────────────────────────────────────────────────────

function sampleCpuUsage(): Promise<number> {
  return new Promise((resolve) => {
    const snap1 = os.cpus().map((c) => ({ ...c.times }));
    setTimeout(() => {
      const cpus2 = os.cpus();
      let idle = 0;
      let total = 0;
      cpus2.forEach((cpu, i) => {
        const t1 = snap1[i];
        const t2 = cpu.times;
        const dIdle  = t2.idle - t1.idle;
        const dTotal = (t2.user - t1.user) + (t2.nice - t1.nice)
                     + (t2.sys  - t1.sys)  + (t2.irq  - t1.irq) + dIdle;
        idle  += dIdle;
        total += dTotal;
      });
      resolve(total > 0 ? Math.round((1 - idle / total) * 1000) / 10 : 0);
    }, 200);
  });
}

function formatUptime(seconds: number): string {
  const SECS_PER_DAY  = 86400;
  const SECS_PER_HOUR = 3600;
  const SECS_PER_MIN  = 60;
  const d = Math.floor(seconds / SECS_PER_DAY);
  const h = Math.floor((seconds % SECS_PER_DAY) / SECS_PER_HOUR);
  const m = Math.floor((seconds % SECS_PER_HOUR) / SECS_PER_MIN);
  return `${d}天 ${h}小时 ${m}分`;
}

function parseApp(body: Record<string, unknown>, res: Response): AppName | null {
  const app = body['app'] as string | undefined;
  if (!app || !(VALID_APPS as readonly string[]).includes(app)) {
    sendErr(res, `Invalid app: must be one of ${VALID_APPS.join(', ')}`, 400);
    return null;
  }
  return app as AppName;
}

function resolveProject(res: Response): string | null {
  const projectDir = process.env['COMPOSE_PROJECT_DIR']?.trim();
  if (!projectDir) { sendErr(res, 'COMPOSE_PROJECT_DIR not configured', 503); return null; }
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

// ── 路由工厂 ─────────────────────────────────────────────────────────────────

const noOp: RequestHandler = (_req, _res, next) => next();

/**
 * @param requirePrivileged 写操作附加鉴权中间件（mandis 传 requireSuperAdmin，begreat 传默认 noOp）
 * @param appName 当前 app 名称，用于读写 runtime 配置
 */
// eslint-disable-next-line max-lines-per-function
export function createSystemRouter(requirePrivileged: RequestHandler = noOp, appName: AppName = 'begreat'): Router {
  const router = Router();

  // GET .../runtime-config（公开，无需鉴权）
  router.get('/runtime-config', async (_req: Request, res: Response) => {
    try {
      sendSucc(res, await readRuntimeConfig(appName));
    } catch (e) {
      sendErr(res, String(e), 500);
    }
  });

  // PUT .../runtime-config（需要鉴权）
  router.put('/runtime-config', requirePrivileged, async (req: Request, res: Response) => {
    const parsed = RuntimeConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      sendErr(res, parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), 400);
      return;
    }
    if (parsed.data.appName !== appName) {
      sendErr(res, `appName mismatch: expected ${appName}`, 400);
      return;
    }
    try {
      await writeRuntimeConfig(parsed.data);
      logger.info(`system:runtime-config saved for ${appName}`);
      sendSucc(res, parsed.data);
    } catch (e) {
      sendErr(res, String(e), 500);
    }
  });

  // GET .../metrics
  router.get('/metrics', async (_req: Request, res: Response) => {
    try {
      const cpuUsage = await sampleCpuUsage();
      const totalMem = os.totalmem();
      const freeMem  = os.freemem();
      const usedMem  = totalMem - freeMem;
      sendSucc(res, {
        cpu: {
          usage:   cpuUsage,
          cores:   os.cpus().length,
          model:   os.cpus()[0]?.model ?? 'Unknown',
          loadAvg: os.loadavg(),
        },
        memory: {
          total:         totalMem,
          used:          usedMem,
          free:          freeMem,
          usagePercent:  Math.round((usedMem / totalMem) * 1000) / 10,
        },
        system: {
          uptime:        os.uptime(),
          uptimeStr:     formatUptime(os.uptime()),
          nodeUptime:    process.uptime(),
          nodeUptimeStr: formatUptime(process.uptime()),
          platform:      os.platform(),
          hostname:      os.hostname(),
        },
      });
    } catch (e) {
      logger.error('system:metrics error', { error: (e as Error).message });
      sendErr(res, String(e), 500);
    }
  });

  // GET .../containers
  router.get('/containers', (_req: Request, res: Response) => {
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

  // POST .../restart  单容器重启
  const ALLOWED_CONTAINERS = [
    'miniapp-mandis', 'miniapp-begreat', 'miniapp-drawing',
    'miniapp-nginx', 'miniapp-mongo', 'miniapp-redis',
  ];
  router.post('/restart', requirePrivileged, (req: Request, res: Response) => {
    const { name } = req.body as { name?: string };
    if (!name || !ALLOWED_CONTAINERS.includes(name)) {
      sendErr(res, 'Invalid container name', 400);
      return;
    }
    exec(`docker restart ${name}`, { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) { sendErr(res, stderr || err.message, 500); return; }
      sendSucc(res, { output: stdout.trim() || `${name} restarted` });
    });
  });

  // POST .../app/restart
  router.post('/app/restart', requirePrivileged, (req: Request, res: Response) => {
    const app = parseApp(req.body as Record<string, unknown>, res);
    if (!app) return;
    const projectDir = resolveProject(res);
    if (!projectDir) return;
    const svc   = APP_SERVICE[app];
    const cname = APP_CONTAINER[app];
    const cmd   = [
      forceKillContainerCmd(cname),
      composeCmd(projectDir, `up -d --force-recreate --no-deps ${svc}`),
      `docker exec ${nginxContainerName()} nginx -s reload 2>/dev/null || true`,
    ].join('\n');

    logger.info(`system:app/restart ${app}`, { svc, cname });
    exec(cmd, { timeout: 120000, cwd: projectDir }, (err, stdout, stderr) => {
      if (err) {
        logger.error(`system:app/restart ${app} failed`, { error: (stderr || err.message).slice(0, 500) });
        sendErr(res, (stderr || err.message).slice(0, 2000), 500);
        return;
      }
      sendSucc(res, { output: (stdout + '\n' + stderr).trim().slice(0, 5000) });
    });
  });

  // POST .../app/build-restart
  router.post('/app/build-restart', requirePrivileged, (req: Request, res: Response) => {
    const app = parseApp(req.body as Record<string, unknown>, res);
    if (!app) return;
    const noCache    = (req.body as { noCache?: boolean }).noCache === true;
    const projectDir = resolveProject(res);
    if (!projectDir) return;
    const svc         = APP_SERVICE[app];
    const cname       = APP_CONTAINER[app];
    const noCacheFlag = noCache ? '--no-cache' : '';
    const cmd         = [
      forceKillContainerCmd(cname),
      composeCmd(projectDir, `build ${noCacheFlag} ${svc}`),
      composeCmd(projectDir, `up -d --force-recreate --no-deps ${svc}`),
      `docker exec ${nginxContainerName()} nginx -s reload 2>/dev/null || true`,
    ].join('\n');

    logger.info(`system:app/build-restart ${app} noCache=${noCache}`, { svc, cname });
    exec(cmd, { timeout: 480000, cwd: projectDir }, (err, stdout, stderr) => {
      if (err) {
        logger.error(`system:app/build-restart ${app} failed`, { error: (stderr || err.message).slice(0, 500) });
        sendErr(res, (stderr || err.message).slice(0, 2000), 500);
        return;
      }
      sendSucc(res, { output: (stdout + '\n' + stderr).trim().slice(0, 8000) });
    });
  });

  // POST .../app/stop
  router.post('/app/stop', requirePrivileged, (req: Request, res: Response) => {
    const app = parseApp(req.body as Record<string, unknown>, res);
    if (!app) return;
    const cname = APP_CONTAINER[app];
    const cmd   = forceKillContainerCmd(cname);

    logger.info(`system:app/stop ${app}`, { cname });
    exec(cmd, { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        logger.error(`system:app/stop ${app} failed`, { error: (stderr || err.message).slice(0, 500) });
        sendErr(res, (stderr || err.message).slice(0, 2000), 500);
        return;
      }
      sendSucc(res, { output: (stdout + '\n' + stderr).trim() || `${cname} stopped` });
    });
  });

  // GET .../app/log-files
  router.get('/app/log-files', (_req: Request, res: Response) => {
    const logDir = path.join(process.cwd(), 'logs');
    try {
      if (!fs.existsSync(logDir)) { sendSucc(res, { files: [] }); return; }
      const raw   = fs.readdirSync(logDir).filter((f) => f.endsWith('.log'));
      const files = raw.map((name) => {
        const base    = name.replace('.log', '');
        const lastDot = base.lastIndexOf('.');
        const type    = lastDot > 0 ? base.substring(0, lastDot) : base;
        const date    = lastDot > 0 ? base.substring(lastDot + 1) : '';
        const stat    = fs.statSync(path.join(logDir, name));
        return { name, type, date, size: stat.size, mtime: stat.mtime.toISOString() };
      }).sort((a, b) => b.mtime.localeCompare(a.mtime));
      sendSucc(res, { files });
    } catch (e) { sendErr(res, String(e), 500); }
  });

  // GET .../app/logs
  router.get('/app/logs', (req: Request, res: Response) => {
    const app = (req.query['app'] as string) || '';
    if (!(VALID_APPS as readonly string[]).includes(app)) {
      sendErr(res, `Invalid app: must be one of ${VALID_APPS.join(', ')}`, 400);
      return;
    }
    const MIN_TAIL  = 50;
    const MAX_TAIL  = 5000;
    const DEFAULT_TAIL = 200;
    const tail    = Math.min(MAX_TAIL, Math.max(MIN_TAIL, parseInt(String(req.query['tail'] || DEFAULT_TAIL), 10) || DEFAULT_TAIL));
    const reqFile = (req.query['file'] as string) || '';

    if (reqFile && reqFile.endsWith('.log')) {
      const safeName = path.basename(reqFile);
      const logFile  = path.join(process.cwd(), 'logs', safeName);
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

    const cname = APP_CONTAINER[app as AppName];
    exec(`docker logs --tail=${tail} "${cname}" 2>&1`, { timeout: 15000 }, (err, stdout) => {
      const dockerLines = (stdout || '').split('\n').filter((l) => l.trim() !== '');
      if (!err && dockerLines.length > 0) {
        sendSucc(res, { lines: dockerLines, tail, source: 'docker' });
        return;
      }
      const today   = new Date().toISOString().split('T')[0];
      const logFile = path.join(process.cwd(), 'logs', `game.${today}.log`);
      exec(`tail -n ${tail} "${logFile}" 2>/dev/null`, { timeout: 5000 }, (_err2, fileStdout) => {
        const fileLines = (fileStdout || '').split('\n').filter((l) => l.trim() !== '');
        sendSucc(res, { lines: fileLines, tail, source: 'file', file: path.basename(logFile) });
      });
    });
  });

  // GET .../app/status
  router.get('/app/status', (_req: Request, res: Response) => {
    const svcList = Object.values(APP_SERVICE).join('|');
    const cmd     = `docker ps -a --filter "name=${svcList}" --format "table {{.Names}}\\t{{.Image}}\\t{{.State}}\\t{{.Status}}\\t{{.Ports}}" 2>&1`;
    exec(cmd, { timeout: 10000 }, (err, stdout) => {
      if (err) {
        sendSucc(res, { lines: [], error: (err.message || '').slice(0, 1000) });
        return;
      }
      sendSucc(res, { lines: stdout.split('\n').filter(Boolean) });
    });
  });

  // GET .../nginx-config
  router.get('/nginx-config', (req: Request, res: Response) => {
    const projectDir = resolveProject(res);
    if (!projectDir) return;
    const confDir = path.join(projectDir, NGINX_CONF_DIR);
    if (!fs.existsSync(confDir)) {
      sendErr(res, `Nginx conf dir not found: ${confDir}`, 503);
      return;
    }
    const file = req.query['file'] as string | undefined;
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

  // PUT .../nginx-config
  router.put('/nginx-config', requirePrivileged, (req: Request, res: Response) => {
    const projectDir = resolveProject(res);
    if (!projectDir) return;
    const { file, content } = req.body as { file?: string; content?: string };
    if (!file || typeof content !== 'string') { sendErr(res, 'Missing file or content', 400); return; }
    const safeName = path.basename(file);
    if (!safeName.endsWith('.conf')) { sendErr(res, 'Only .conf files allowed', 400); return; }
    const filePath   = path.join(projectDir, NGINX_CONF_DIR, safeName);
    const backupPath = `${filePath}.bak.${Date.now()}`;
    try {
      if (fs.existsSync(filePath)) fs.copyFileSync(filePath, backupPath);
      fs.writeFileSync(filePath, content, 'utf-8');
      logger.info(`system:nginx-config saved ${safeName}`);
      sendSucc(res, { file: safeName, saved: true, backup: path.basename(backupPath) });
    } catch (e) {
      sendErr(res, `Failed: ${(e as Error).message}`, 500);
    }
  });

  // POST .../nginx-test
  router.post('/nginx-test', requirePrivileged, (_req: Request, res: Response) => {
    const cmd = `docker exec ${nginxContainerName()} nginx -t 2>&1`;
    exec(cmd, { timeout: 15000 }, (err, stdout, stderr) => {
      const output = (stdout + '\n' + stderr).trim();
      sendSucc(res, { valid: !err, output });
    });
  });

  // POST .../nginx-reload
  router.post('/nginx-reload', requirePrivileged, (_req: Request, res: Response) => {
    const cmd = `docker exec ${nginxContainerName()} nginx -s reload 2>&1`;
    exec(cmd, { timeout: 15000 }, (err, stdout, stderr) => {
      if (err) { sendErr(res, (stderr || err.message).slice(0, 2000), 500); return; }
      sendSucc(res, { output: (stdout + '\n' + stderr).trim() || 'Nginx reloaded' });
    });
  });

  // POST .../prune
  router.post('/prune', requirePrivileged, (_req: Request, res: Response) => {
    exec('docker image prune -f', { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) { sendErr(res, (stderr || err.message).slice(0, 2000), 500); return; }
      sendSucc(res, { output: (stdout + '\n' + stderr).trim() || 'Pruned' });
    });
  });

  return router;
}
