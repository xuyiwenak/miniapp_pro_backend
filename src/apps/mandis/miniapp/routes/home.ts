import { Router, Request, Response } from 'express';
import { sendSucc, sendErr } from '../../../../shared/miniapp/middleware/response';
import { getWorkModel } from '../../../../dbservice/model/GlobalInfoDBModel';
import { getNicknameMap } from '../../../../dbservice/model/ZoneDBModel';
import type { IWork } from '../../../../entity/work.entity';
import { buildHealingResponse } from './healing';
import { logRequest, logRequestError } from '../../../../util/requestLogger';
import { resolveImageUrl } from '../../../../util/imageUploader';
import { loadUserIdByToken } from '../../../../auth/RedisTokenStore';
import { gameLogger as logger } from '../../../../util/logger';

const router = Router();
const OSS_PREFIX = 'oss://';

const CARDS = [
  { url: '/static/home/card0.png', desc: '少年,星空与梦想', tags: [{ text: 'AI绘画', theme: 'primary' }, { text: '版权素材', theme: 'success' }] },
  { url: '/static/home/card1.png', desc: '仰望星空的少女', tags: [{ text: 'AI绘画', theme: 'primary' }, { text: '版权素材', theme: 'success' }] },
  { url: '/static/home/card3.png', desc: '仰望星空的少年', tags: [{ text: 'AI绘画', theme: 'primary' }, { text: '版权素材', theme: 'success' }] },
  { url: '/static/home/card2.png', desc: '少年,星空与梦想', tags: [{ text: 'AI绘画', theme: 'primary' }, { text: '版权素材', theme: 'success' }] },
  { url: '/static/home/card4.png', desc: '多彩的天空', tags: [{ text: 'AI绘画', theme: 'primary' }, { text: '版权素材', theme: 'success' }] },
];

const SWIPERS = new Array(6).fill('/static/home/swiper0.png');

async function resolveViewerId(req: Request): Promise<string | undefined> {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return undefined;
  const token = auth.slice(7).trim();
  return (await loadUserIdByToken(token)) || undefined;
}

function resolveWorkImages(work: IWork): { url: string; name?: string; type?: string }[] {
  if (!Array.isArray(work.images) || work.images.length === 0) return work.images;
  return work.images.map((img: { url?: string; name?: string; type?: string }) => {
    const raw = (img?.url ?? '').trim();
    const url = raw && raw.startsWith(OSS_PREFIX) ? resolveImageUrl(raw) : raw;
    return { ...img, url };
  });
}

function mapWorkToCard(
  w: IWork,
  nicknameMap: Record<string, string>,
): { workId: string; url: string; desc: string; tags: { text: string; theme: string }[]; nickname: string } {
  const cover = w.images?.[0];
  const baseTags = Array.isArray(w.tags) && w.tags.length > 0 ? w.tags : ['AI绘画', '版权素材'];
  const tags = baseTags.map((text, index) => {
    let theme: 'primary' | 'success' | 'default' = 'default';
    if (index === 0) theme = 'primary';
    else if (index === 1) theme = 'success';
    return { text, theme };
  });
  const rawUrl = cover?.url ?? '/static/home/card0.png';
  const url = rawUrl && rawUrl.startsWith(OSS_PREFIX) ? resolveImageUrl(rawUrl) : rawUrl;
  return { workId: w.workId, url, desc: w.desc, tags, nickname: (w.authorId && nicknameMap[w.authorId]) || '匿名' };
}

router.get('/cards', async (_req: Request, res: Response) => {
  try {
    const Work = getWorkModel();
    let works = (await Work.find({ status: 'published', featured: true })
      .sort({ createdAt: -1 }).limit(20).lean().exec()) as IWork[];
    if (works.length === 0) {
      works = (await Work.find({ status: 'published' })
        .sort({ createdAt: -1 }).limit(20).lean().exec()) as IWork[];
    }
    const authorIds = works.filter((w) => w.authorId).map((w) => w.authorId as string);
    const nicknameMap = await getNicknameMap(authorIds).catch(() => ({} as Record<string, string>));
    const list = works.length > 0 ? works.map((w) => mapWorkToCard(w, nicknameMap)) : CARDS;
    sendSucc(res, list);
  } catch (err) {
    logger.error('home:cards error', { error: (err as Error).message });
    sendSucc(res, CARDS);
  }
});

router.get('/swipers', (_req: Request, res: Response) => {
  sendSucc(res, SWIPERS);
});

/** 根据 workId 获取单条已发布作品详情（无需登录，但登录用户会正确识别 isOwner） */
router.get('/workDetail', async (req: Request, res: Response) => {
  const workId = (req.query?.workId as string)?.trim();
  const viewerId = await resolveViewerId(req);
  logRequest('home.ts:workDetail:entry', 'workDetail request', {
    req, params: req.params ?? {}, requestBody: { workId: workId || undefined },
    extra: { query: req.query },
  });
  if (!workId) {
    logRequest('home.ts:workDetail:validation', 'missing workId', { req, requestBody: { workId }, statusCode: 400 });
    sendErr(res, 'Missing workId', 400);
    return;
  }
  try {
    const WorkModel = getWorkModel();
    const work = (await WorkModel.findOne({ workId, status: 'published' }).lean().exec()) as IWork | null;
    if (!work) {
      logRequest('home.ts:workDetail:notFound', 'work not found', { req, requestBody: { workId }, statusCode: 404 });
      sendErr(res, 'Work not found', 404);
      return;
    }
    logRequest('home.ts:workDetail:success', 'workDetail success', {
      req, requestBody: { workId },
      responseBody: { workId: work.workId, desc: work.desc, imagesCount: work.images?.length ?? 0 },
      statusCode: 200,
    });
    const healingInfo = buildHealingResponse(work, viewerId);
    const images = resolveWorkImages(work);
    sendSucc(res, { ...work, images, ...healingInfo });
  } catch (err) {
    logRequestError('home.ts:workDetail:error', 'workDetail server error', {
      req, requestBody: { workId }, statusCode: 500,
      extra: { errorName: (err as Error).name, errorMessage: (err as Error).message },
    });
    sendErr(res, 'Server error', 500);
  }
});

export default router;
