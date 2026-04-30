import https from 'https';
import { ComponentManager, EComName } from '../common/BaseComponent';
import { gameLogger as logger } from './logger';

let cachedToken: string | null = null;
let expireAt = 0;

function getWxConfig(): { appId: string; appSecret: string } | null {
  try {
    const sysCfg = ComponentManager.instance.getComponent(EComName.SysCfgComponent) as {
      server_auth_config?: { wx_miniapp?: { appId?: string; appSecret?: string } };
    } | null;
    const cfg = sysCfg?.server_auth_config?.wx_miniapp;
    if (
      !cfg?.appId ||
      !cfg?.appSecret ||
      cfg.appId === 'YOUR_WECHAT_APPID' ||
      cfg.appSecret === 'YOUR_WECHAT_APPSECRET'
    ) {
      return null;
    }
    return { appId: cfg.appId, appSecret: cfg.appSecret };
  } catch {
    return null;
  }
}

function fetchAccessToken(appId: string, appSecret: string): Promise<{ access_token: string; expires_in: number }> {
  const url =
    'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential' +
    `&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`;

  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => {
          try {
            const json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (json.access_token && json.expires_in) {
              resolve({ access_token: json.access_token, expires_in: json.expires_in });
            } else {
              reject(new Error(`wx getAccessToken failed: ${json.errcode} ${json.errmsg}`));
            }
          } catch (err) {
            reject(err);
          }
        });
      })
      .on('error', (err) => reject(err));
  });
}

export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < expireAt) {
    return cachedToken;
  }

  const cfg = getWxConfig();
  if (!cfg) {
    throw new Error('WeChat appId/appSecret not configured');
  }

  const result = await fetchAccessToken(cfg.appId, cfg.appSecret);
  cachedToken = result.access_token;
  expireAt = Date.now() + (result.expires_in - 300) * 1000;
  logger.info('wx access_token refreshed, expires_in=', result.expires_in);
  return cachedToken;
}
