import { Router, Request, Response } from 'express';
import https from 'https';
import { ComponentManager, EComName } from '../../../../common/BaseComponent';
import type { PlayerComponent } from '../../../../component/PlayerComponent';
import { sendSucc, sendErr } from '../../../../shared/miniapp/middleware/response';
import { issueToken } from '../../../../shared/miniapp/tokenStore';
import { revokeToken } from '../../../../auth/RedisTokenStore';
import { getPlayerModel } from '../../../../dbservice/model/ZoneDBModel';
import { authMiddleware, type MiniappRequest } from '../../../../shared/miniapp/middleware/auth';
import { gameLogger as logger } from '../../../../util/logger';

const router = Router();

type WxCode2SessionResponse = {
  openid?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
};

router.post('/postPasswordLogin', async (req: Request, res: Response) => {
  const payload = req.body?.data ?? req.body;
  const account = payload?.account;
  const password = payload?.password;
  if (!account || !password) {
    sendErr(res, 'Missing account or password', 400);
    return;
  }

  const playerComp =
    ComponentManager.instance.getComponentByKey<PlayerComponent>('PlayerComponent');
  if (!playerComp) {
    sendErr(res, 'Server not ready', 503);
    return;
  }

  const ret = await playerComp.login(account, password);
  if (!ret.ok) {
    sendErr(res, ret.error, 401);
    return;
  }

  const token = await issueToken(ret.data.userId);
  sendSucc(res, { token });
});

/** 普通账号注册：账号 + 密码 */
router.post('/postPasswordRegister', async (req: Request, res: Response) => {
  const payload = req.body?.data ?? req.body;
  const account = (payload?.account as string | undefined)?.trim();
  const password = (payload?.password as string | undefined) ?? '';

  if (!account || !password) {
    sendErr(res, 'Missing account or password', 400);
    return;
  }

  const playerComp =
    ComponentManager.instance.getComponentByKey<PlayerComponent>('PlayerComponent');
  if (!playerComp) {
    sendErr(res, 'Server not ready', 503);
    return;
  }

  const ret = await playerComp.register(account, password);
  if (!ret.ok) {
    const status = ret.error === 'AccountExists' ? 409 : 500;
    sendErr(res, ret.error, status);
    return;
  }

  const token = await issueToken(ret.data.userId);
  sendSucc(res, { token });
});

async function fetchWxCode2Session(
  code: string,
  appId: string,
  appSecret: string,
): Promise<{ openId: string; unionId?: string } | null> {
  const url =
    `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appId)}` +
    `&secret=${encodeURIComponent(appSecret)}` +
    `&js_code=${encodeURIComponent(code)}` +
    '&grant_type=authorization_code';
  try {
    const resp = await new Promise<WxCode2SessionResponse>((resolve, reject) => {
      https.get(url, (wxRes) => {
        const chunks: Buffer[] = [];
        wxRes.on('data', (d) => chunks.push(d));
        wxRes.on('end', () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(e); }
        });
      }).on('error', (e) => reject(e));
    });
    if (!resp || !resp.openid) {
      logger.warn('wxLogin jscode2session failed', { errcode: resp?.errcode, errmsg: resp?.errmsg });
      return null;
    }
    return { openId: resp.openid, unionId: resp.unionid };
  } catch {
    return null;
  }
}

/** 微信小程序登录：使用 wx.login code 换取 openId，再走 PlayerComponent.loginByOpenId */
router.post('/wxLogin', async (req: Request, res: Response) => {
  const payload = req.body?.data ?? req.body;
  const code = (payload?.code as string | undefined)?.trim();
  if (!code) { sendErr(res, 'Missing code', 400); return; }

  const sysCfgComp = ComponentManager.instance.getComponent(
    EComName.SysCfgComponent,
  ) as { server_auth_config?: { wx_miniapp?: { appId?: string; appSecret?: string } } } | null;
  const wxCfg = sysCfgComp?.server_auth_config?.wx_miniapp;
  const appId = wxCfg?.appId;
  const appSecret = wxCfg?.appSecret;

  if (!appId || !appSecret || appId === 'YOUR_WECHAT_APPID' || appSecret === 'YOUR_WECHAT_APPSECRET') {
    sendErr(res, 'WeChat config not set', 500);
    return;
  }

  const wechatSession = await fetchWxCode2Session(code, appId, appSecret);
  if (!wechatSession) { sendErr(res, 'WeChat login failed', 401); return; }

  const playerComp =
    ComponentManager.instance.getComponentByKey<PlayerComponent>('PlayerComponent');
  if (!playerComp) { sendErr(res, 'Server not ready', 503); return; }

  const ret = await playerComp.loginByOpenIdWithUnionId(
    wechatSession.openId,
    wechatSession.unionId,
  );
  if (!ret.ok) { sendErr(res, ret.error, 500); return; }
  const token = await issueToken(ret.data.userId);
  sendSucc(res, { token, userId: ret.data.userId, isNewUser: true });
});

/** 已登录用户解绑微信（要求账号存在密码，否则解绑后无法登录） */
router.post('/unbindWechat', authMiddleware, async (req: MiniappRequest, res: Response) => {
  const userId = req.userId;
  if (!userId) { sendErr(res, 'Unauthorized', 401); return; }
  const playerComp =
    ComponentManager.instance.getComponentByKey<PlayerComponent>('PlayerComponent');
  if (!playerComp) {
    sendErr(res, 'Server not ready', 503);
    return;
  }
  const zoneId = playerComp.getDefaultZoneId();
  if (!zoneId) {
    sendErr(res, 'Server not ready', 503);
    return;
  }
  const Player = getPlayerModel(zoneId);
  const player = await Player.findOne({ userId }).exec();
  if (!player) {
    sendErr(res, 'User not found', 404);
    return;
  }
  if (!player.password) {
    sendErr(res, 'Password not set; cannot unbind', 400);
    return;
  }
  player.openId = undefined;
  await player.save();
  sendSucc(res, { success: true });
});

/** 绑定手机号：前端传微信 getPhoneNumber 返回的 code */
router.post('/bindPhone', authMiddleware, async (req: MiniappRequest, res: Response) => {
  const userId = req.userId;
  if (!userId) { sendErr(res, 'Unauthorized', 401); return; }
  const payload = req.body?.data ?? req.body;
  const code = (payload?.code as string | undefined)?.trim();
  if (!code) {
    sendErr(res, 'Missing code', 400);
    return;
  }
  const playerComp = ComponentManager.instance.getComponentByKey<PlayerComponent>('PlayerComponent');
  if (!playerComp) {
    sendErr(res, 'Server not ready', 503);
    return;
  }
  const ret = await playerComp.bindPhone(userId, code);
  if (!ret.ok) {
    sendErr(res, ret.error, 500);
    return;
  }
  sendSucc(res, { phone: ret.phone });
});

/** 手机号登录（供未来网站使用）：需要已绑定手机号的用户 */
router.post('/phoneLogin', async (req: Request, res: Response) => {
  const payload = req.body?.data ?? req.body;
  const phone = (payload?.phone as string | undefined)?.trim();
  if (!phone) {
    sendErr(res, 'Missing phone', 400);
    return;
  }
  const playerComp = ComponentManager.instance.getComponentByKey<PlayerComponent>('PlayerComponent');
  if (!playerComp) {
    sendErr(res, 'Server not ready', 503);
    return;
  }
  const ret = await playerComp.findByPhone(phone);
  if (!ret.ok) {
    sendErr(res, ret.error === 'NotFound' ? 'PhoneNotBound' : ret.error, ret.error === 'NotFound' ? 404 : 500);
    return;
  }
  const token = await issueToken(ret.data.userId);
  sendSucc(res, { token, userId: ret.data.userId });
});

/** 退出登录：令当前 token 失效 */
router.post('/logout', async (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    if (token) {
      try {
        await revokeToken(token);
      } catch (err) {
        logger.error('logout revokeToken error', { token: token.slice(0, 8) + '...', error: (err as Error).message });
      }
    }
  }
  sendSucc(res, { success: true });
});

export default router;
