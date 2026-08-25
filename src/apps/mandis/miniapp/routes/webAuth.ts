import { randomBytes } from 'crypto';
import https from 'https';
import DirectMailClient, { SingleSendMailRequest } from '@alicloud/dm20151123';
import DysmsapiClient, { SendSmsRequest } from '@alicloud/dysmsapi20170525';
import { Config as OpenApiConfig } from '@alicloud/openapi-client';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { ComponentManager } from '../../../../common/BaseComponent';
import type { PlayerComponent } from '../../../../component/PlayerComponent';
import { consumeExpiringValue, saveExpiringValue } from '../../../../auth/RedisTokenStore';
import { authMiddleware, type MiniappRequest } from '../../../../shared/miniapp/middleware/auth';
import { sendErr, sendSucc } from '../../../../shared/miniapp/middleware/response';
import { issueToken } from '../../../../shared/miniapp/tokenStore';
import { gameLogger as logger } from '../../../../util/logger';
import { consumeAuthChallenge, createAuthChallenge, normalizeEmail } from '../services/webAuthChallenge';

const router = Router();
const WECHAT_STATE_TTL_SECONDS = 10 * 60;
const LOGIN_TICKET_TTL_SECONDS = 60;
const PHONE_PATTERN = /^1\d{10}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_LOGIN_PURPOSE = 'phone-login';
const EMAIL_LOGIN_PURPOSE = 'email-login';
const PHONE_BIND_PURPOSE = 'phone-bind';
const EMAIL_BIND_PURPOSE = 'email-bind';

const PhoneSchema = z.object({ phone: z.string().trim().regex(PHONE_PATTERN) });
const EmailSchema = z.object({ email: z.string().trim().regex(EMAIL_PATTERN) });
const PhoneVerifySchema = PhoneSchema.extend({ code: z.string().regex(/^\d{6}$/) });
const EmailVerifySchema = EmailSchema.extend({ code: z.string().regex(/^\d{6}$/) });

type WechatTokenResponse = { access_token?: string; openid?: string; unionid?: string };
type WechatUserResponse = { openid?: string; unionid?: string };
type WechatState = { purpose: 'bind' | 'login'; userId?: string };

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function getClientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function getPlayerComponent(): PlayerComponent | undefined {
  return ComponentManager.instance.getComponentByKey<PlayerComponent>('PlayerComponent');
}

function getPlayerOrRespond(res: Response): PlayerComponent | undefined {
  const playerComp = getPlayerComponent();
  if (!playerComp) sendErr(res, 'Server not ready', 503);
  return playerComp;
}

async function sendAliyunSms(phone: string, code: string): Promise<void> {
  const client = new DysmsapiClient(new OpenApiConfig({
    accessKeyId: getRequiredEnv('ALIYUN_SMS_ACCESS_KEY_ID'),
    accessKeySecret: getRequiredEnv('ALIYUN_SMS_ACCESS_KEY_SECRET'),
    endpoint: 'dysmsapi.aliyuncs.com',
  }));
  const response = await client.sendSms(new SendSmsRequest({
    phoneNumbers: phone,
    signName: getRequiredEnv('ALIYUN_SMS_SIGN_NAME'),
    templateCode: getRequiredEnv('ALIYUN_SMS_TEMPLATE_CODE'),
    templateParam: JSON.stringify({ code }),
  }));
  if (response.body?.code !== 'OK') throw new Error(response.body?.message ?? 'Aliyun SMS rejected request');
}

function buildEmailContent(code: string, locale: 'en' | 'zh-CN'): { subject: string; html: string } {
  if (locale === 'en') return {
    subject: 'Your Original Sense verification code',
    html: `<p>Your verification code is <strong>${code}</strong>.</p><p>It expires in 5 minutes.</p>`,
  };
  return {
    subject: '原色有感验证码',
    html: `<p>你的验证码是 <strong>${code}</strong>。</p><p>验证码将在 5 分钟后失效，请勿转发给他人。</p>`,
  };
}

async function sendAliyunEmail(email: string, code: string, locale: 'en' | 'zh-CN'): Promise<void> {
  const content = buildEmailContent(code, locale);
  const client = new DirectMailClient(new OpenApiConfig({
    accessKeyId: getRequiredEnv('ALIYUN_DM_ACCESS_KEY_ID'),
    accessKeySecret: getRequiredEnv('ALIYUN_DM_ACCESS_KEY_SECRET'),
    regionId: process.env.ALIYUN_DM_REGION_ID?.trim() || 'cn-hangzhou',
  }));
  await client.singleSendMail(new SingleSendMailRequest({
    accountName: getRequiredEnv('ALIYUN_DM_ACCOUNT_NAME'),
    addressType: 1,
    fromAlias: process.env.ALIYUN_DM_FROM_ALIAS?.trim() || '原色有感',
    htmlBody: content.html,
    replyToAddress: false,
    subject: content.subject,
    tagName: process.env.ALIYUN_DM_TAG_NAME?.trim() || 'original-sense-auth',
    toAddress: email,
  }));
}

function readJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as T); } catch (error) { reject(error); }
      });
    }).on('error', reject);
  });
}

function buildWechatStartUrl(state: string): string {
  const params = new URLSearchParams({
    appid: getRequiredEnv('WECHAT_WEB_APP_ID'), redirect_uri: getRequiredEnv('WECHAT_WEB_REDIRECT_URI'),
    response_type: 'code', scope: 'snsapi_login', state,
  });
  return `https://open.weixin.qq.com/connect/qrconnect?${params.toString()}#wechat_redirect`;
}

async function getWechatIdentity(code: string): Promise<WechatUserResponse> {
  const tokenUrl = new URL('https://api.weixin.qq.com/sns/oauth2/access_token');
  tokenUrl.search = new URLSearchParams({ appid: getRequiredEnv('WECHAT_WEB_APP_ID'), secret: getRequiredEnv('WECHAT_WEB_APP_SECRET'), code, grant_type: 'authorization_code' }).toString();
  const token = await readJson<WechatTokenResponse>(tokenUrl.toString());
  if (!token.access_token || !token.openid) throw new Error('WeChat did not return an identity');
  const userUrl = new URL('https://api.weixin.qq.com/sns/userinfo');
  userUrl.search = new URLSearchParams({ access_token: token.access_token, openid: token.openid }).toString();
  const user = await readJson<WechatUserResponse>(userUrl.toString());
  return { openid: user.openid ?? token.openid, unionid: user.unionid ?? token.unionid };
}

async function sendPhoneCode(req: Request, res: Response, purpose: string): Promise<void> {
  const parsed = PhoneSchema.safeParse(req.body);
  if (!parsed.success) return sendErr(res, 'Invalid phone number', 400);
  try {
    const result = await createAuthChallenge('sms', purpose, parsed.data.phone, getClientIp(req), (code) => sendAliyunSms(parsed.data.phone, code));
    if (!result.ok) return sendErr(res, 'Please wait before requesting another code', 429);
    sendSucc(res, { expiresInSeconds: result.expiresInSeconds });
  } catch (error) {
    logger.error('web SMS send failed', { error: (error as Error).message });
    sendErr(res, 'Unable to send verification code', 503);
  }
}

async function sendEmailCode(req: Request, res: Response, purpose: string): Promise<void> {
  const parsed = EmailSchema.safeParse(req.body);
  if (!parsed.success) return sendErr(res, 'Invalid email address', 400);
  const email = normalizeEmail(parsed.data.email);
  const locale = req.body?.locale === 'en' ? 'en' : 'zh-CN';
  try {
    const result = await createAuthChallenge('email', purpose, email, getClientIp(req), (code) => sendAliyunEmail(email, code, locale));
    if (!result.ok) return sendErr(res, 'Please wait before requesting another code', 429);
    sendSucc(res, { expiresInSeconds: result.expiresInSeconds });
  } catch (error) {
    logger.error('web email send failed', { error: (error as Error).message });
    sendErr(res, 'Unable to send verification code', 503);
  }
}

router.post('/sms/send', (req, res) => sendPhoneCode(req, res, PHONE_LOGIN_PURPOSE));
router.post('/email/send', (req, res) => sendEmailCode(req, res, EMAIL_LOGIN_PURPOSE));

router.post('/sms/verify', async (req: Request, res: Response) => {
  const parsed = PhoneVerifySchema.safeParse(req.body);
  if (!parsed.success) return sendErr(res, 'Invalid phone number or code', 400);
  const verified = await consumeAuthChallenge('sms', PHONE_LOGIN_PURPOSE, parsed.data.phone, parsed.data.code);
  if (!verified) return sendErr(res, 'Verification code is invalid or expired', 401);
  const playerComp = getPlayerOrRespond(res); if (!playerComp) return;
  const login = await playerComp.loginByPhone(parsed.data.phone);
  if (!login.ok) return sendErr(res, 'Unable to sign in', 500);
  sendSucc(res, { token: await issueToken(login.data.userId), userId: login.data.userId });
});

router.post('/email/verify', async (req: Request, res: Response) => {
  const parsed = EmailVerifySchema.safeParse(req.body);
  if (!parsed.success) return sendErr(res, 'Invalid email address or code', 400);
  const email = normalizeEmail(parsed.data.email);
  const verified = await consumeAuthChallenge('email', EMAIL_LOGIN_PURPOSE, email, parsed.data.code);
  if (!verified) return sendErr(res, 'Verification code is invalid or expired', 401);
  const playerComp = getPlayerOrRespond(res); if (!playerComp) return;
  const login = await playerComp.loginByEmail(email);
  if (!login.ok) return sendErr(res, 'Unable to sign in', 500);
  sendSucc(res, { token: await issueToken(login.data.userId), userId: login.data.userId });
});

async function startWechat(req: MiniappRequest | Request, res: Response, stateData: WechatState): Promise<void> {
  try {
    const state = randomBytes(24).toString('hex');
    await saveExpiringValue(`web:wx:state:${state}`, JSON.stringify(stateData), WECHAT_STATE_TTL_SECONDS);
    res.redirect(buildWechatStartUrl(state));
  } catch (error) {
    logger.error('web WeChat start failed', { error: (error as Error).message });
    sendErr(res, 'WeChat sign-in is unavailable', 503);
  }
}

router.get('/wechat/start', (req, res) => startWechat(req, res, { purpose: 'login' }));
router.post('/wechat/bind/start', authMiddleware, async (req: MiniappRequest, res) => {
  if (!req.userId) return sendErr(res, 'Unauthorized', 401);
  try {
    const state = randomBytes(24).toString('hex');
    await saveExpiringValue(
      `web:wx:state:${state}`,
      JSON.stringify({ purpose: 'bind', userId: req.userId } satisfies WechatState),
      WECHAT_STATE_TTL_SECONDS
    );
    sendSucc(res, { url: buildWechatStartUrl(state) });
  } catch (error) {
    logger.error('web WeChat bind start failed', { error: (error as Error).message });
    sendErr(res, 'WeChat binding is unavailable', 503);
  }
});

router.get('/wechat/callback', async (req: Request, res: Response) => {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const rawState = state ? await consumeExpiringValue(`web:wx:state:${state}`) : null;
  if (!code || !rawState) return sendErr(res, 'Invalid WeChat authorization response', 400);
  try {
    const storedState = JSON.parse(rawState) as WechatState;
    const identity = await getWechatIdentity(code);
    if (!identity.openid) throw new Error('WeChat openid missing');
    const playerComp = getPlayerOrRespond(res); if (!playerComp) return;
    if (storedState.purpose === 'bind' && storedState.userId) {
      const bound = await playerComp.bindWechatIdentity(storedState.userId, identity.openid, identity.unionid);
      if (!bound.ok) return sendErr(res, 'This WeChat account is already bound', 409);
      return res.redirect(`${getRequiredEnv('WEB_AUTH_RETURN_URL')}?wechat_bound=1`);
    }
    const login = await playerComp.loginByWechatIdentity(identity.openid, identity.unionid);
    if (!login.ok) return sendErr(res, 'Unable to sign in', 500);
    const ticket = randomBytes(24).toString('hex');
    await saveExpiringValue(`web:login:ticket:${ticket}`, await issueToken(login.data.userId), LOGIN_TICKET_TTL_SECONDS);
    const returnUrl = new URL(getRequiredEnv('WEB_AUTH_RETURN_URL'));
    returnUrl.searchParams.set('login_ticket', ticket);
    res.redirect(returnUrl.toString());
  } catch (error) {
    logger.error('web WeChat callback failed', { error: (error as Error).message });
    sendErr(res, 'WeChat sign-in failed', 502);
  }
});

router.post('/wechat/exchange', async (req: Request, res: Response) => {
  const ticket = typeof req.body?.ticket === 'string' ? req.body.ticket : '';
  if (!/^[a-f0-9]{48}$/.test(ticket)) return sendErr(res, 'Invalid login ticket', 400);
  const token = await consumeExpiringValue(`web:login:ticket:${ticket}`);
  if (!token) return sendErr(res, 'Login ticket is invalid or expired', 401);
  sendSucc(res, { token });
});

router.get('/profile', authMiddleware, async (req: MiniappRequest, res: Response) => {
  const playerComp = getPlayerOrRespond(res); if (!playerComp || !req.userId) return;
  const profile = await playerComp.getAuthProfile(req.userId);
  if (!profile.ok) return sendErr(res, 'Profile not found', 404);
  sendSucc(res, profile.data);
});

router.post('/profile/phone/send', authMiddleware, (req, res) => sendPhoneCode(req, res, PHONE_BIND_PURPOSE));
router.post('/profile/email/send', authMiddleware, (req, res) => sendEmailCode(req, res, EMAIL_BIND_PURPOSE));

router.post('/profile/phone/bind', authMiddleware, async (req: MiniappRequest, res: Response) => {
  const parsed = PhoneVerifySchema.safeParse(req.body);
  if (!parsed.success || !req.userId) return sendErr(res, 'Invalid phone number or code', 400);
  const verified = await consumeAuthChallenge('sms', PHONE_BIND_PURPOSE, parsed.data.phone, parsed.data.code);
  if (!verified) return sendErr(res, 'Verification code is invalid or expired', 401);
  const playerComp = getPlayerOrRespond(res); if (!playerComp) return;
  const bound = await playerComp.bindWebPhone(req.userId, parsed.data.phone);
  if (!bound.ok) return sendErr(res, 'This phone number is already bound', 409);
  sendSucc(res, { bound: true });
});

router.post('/profile/email/bind', authMiddleware, async (req: MiniappRequest, res: Response) => {
  const parsed = EmailVerifySchema.safeParse(req.body);
  if (!parsed.success || !req.userId) return sendErr(res, 'Invalid email address or code', 400);
  const email = normalizeEmail(parsed.data.email);
  const verified = await consumeAuthChallenge('email', EMAIL_BIND_PURPOSE, email, parsed.data.code);
  if (!verified) return sendErr(res, 'Verification code is invalid or expired', 401);
  const playerComp = getPlayerOrRespond(res); if (!playerComp) return;
  const bound = await playerComp.bindEmail(req.userId, email);
  if (!bound.ok) return sendErr(res, 'This email address is already bound', 409);
  sendSucc(res, { bound: true });
});

export default router;
