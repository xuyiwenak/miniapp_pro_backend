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

router.get('/cards', async (_req: Request, res: Response) => {
  try {
    const Work = getWorkModel();
    // 优先展示管理员精选作品；若无精选则回退到全部已发布
    let works = (await Work.find({ status: 'published', featured: true })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean()
      .exec()) as IWork[];
    if (works.length === 0) {
      works = (await Work.find({ status: 'published' })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean()
        .exec()) as IWork[];
    }

    // 查询作者昵称（跨所有 zone）
    const authorIds = works.filter((w) => w.authorId).map((w) => w.authorId as string);
    const nicknameMap = await getNicknameMap(authorIds).catch(() => ({} as Record<string, string>));

    const list =
      works.length > 0
        ? works.map((w) => {
          const cover = w.images?.[0];
          const baseTags =
              Array.isArray(w.tags) && w.tags.length > 0
                ? w.tags
                : ['AI绘画', '版权素材'];

          const tags = baseTags.map((text, index) => {
            let theme: 'primary' | 'success' | 'default' = 'default';
            if (index === 0) {
              theme = 'primary';
            } else if (index === 1) {
              theme = 'success';
            }
            return { text, theme };
          });

          const rawUrl = cover?.url ?? '/static/home/card0.png';
          const url =
              rawUrl && rawUrl.startsWith(OSS_PREFIX) ? resolveImageUrl(rawUrl) : rawUrl;
          return {
            workId: w.workId,
            url,
            desc: w.desc,
            tags,
            nickname: (w.authorId && nicknameMap[w.authorId]) || '匿名',
          };
        })
        : CARDS;

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

  // 可选 token 解析：不强制登录，但有 token 时识别 viewerId 以正确返回 isOwner
  let viewerId: string | undefined;
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    viewerId = (await loadUserIdByToken(token)) || undefined;
  }

  logRequest('home.ts:workDetail:entry', 'workDetail request', {
    req,
    params: req.params ?? {},
    requestBody: { workId: workId || undefined },
    extra: { query: req.query },
  });

  if (!workId) {
    logRequest('home.ts:workDetail:validation', 'missing workId', {
      req,
      requestBody: { workId },
      statusCode: 400,
    });
    sendErr(res, 'Missing workId', 400);
    return;
  }
  try {
    const WorkModel = getWorkModel();
    const work = (await WorkModel.findOne({ workId, status: 'published' }).lean().exec()) as IWork | null;
    if (!work) {
      logRequest('home.ts:workDetail:notFound', 'work not found', {
        req,
        requestBody: { workId },
        statusCode: 404,
      });
      sendErr(res, 'Work not found', 404);
      return;
    }
    logRequest('home.ts:workDetail:success', 'workDetail success', {
      req,
      requestBody: { workId },
      responseBody: { workId: work.workId, desc: work.desc, imagesCount: work.images?.length ?? 0 },
      statusCode: 200,
    });
    const healingInfo = buildHealingResponse(work, viewerId);
    const images =
      Array.isArray(work.images) && work.images.length > 0
        ? work.images.map((img: { url?: string; name?: string; type?: string }) => {
          const raw = (img?.url ?? '').trim();
          const url = raw && raw.startsWith(OSS_PREFIX) ? resolveImageUrl(raw) : raw;
          return { ...img, url };
        })
        : work.images;
    sendSucc(res, { ...work, images, ...healingInfo });
  } catch (err) {
    logRequestError('home.ts:workDetail:error', 'workDetail server error', {
      req,
      requestBody: { workId },
      statusCode: 500,
      extra: {
        errorName: (err as Error).name,
        errorMessage: (err as Error).message,
      },
    });
    sendErr(res, 'Server error', 500);
  }
});

export default router;
