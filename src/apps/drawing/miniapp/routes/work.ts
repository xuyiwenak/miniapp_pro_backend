import path from 'path';
import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ComponentManager } from '../../../../common/BaseComponent';
import type { PlayerComponent } from '../../../../component/PlayerComponent';
import { sendSucc, sendErr } from '../../../../shared/miniapp/middleware/response';
import type { MiniappRequest } from '../../../../shared/miniapp/middleware/auth';
import { getWorkModel } from '../../../../dbservice/model/GlobalInfoDBModel';
import type { IWork } from '../../../../entity/work.entity';
import { buildHealingResponse } from './healing';
import { logRequest, logRequestError } from '../../../../util/requestLogger';
import { checkText, checkImage } from '../../../../util/wxContentSecurity';
import { uploadToStorage, resolveImageUrl, deleteFromStorage } from '../../../../util/imageUploader';
import { gameLogger as logger } from '../../../../util/logger';

const router = Router();

const OSS_PREFIX = 'oss://';

/** 是否为小程序临时路径（服务端无法访问，需客户端先上传或传 base64） */
function isTempOrUnfetchableUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return true;
  const u = url.trim().toLowerCase();
  return u.startsWith('http://tmp/') || u.startsWith('wxfile://') || u === '';
}

/** 判断是否为已存储的 URL（OSS 或 CDN/公网），可不再上传 */
function isStoredImageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const u = url.trim();
  if (u.startsWith(OSS_PREFIX) || u.startsWith('https://')) return true;
  if (u.startsWith('http://') && !isTempOrUnfetchableUrl(u)) return true;
  return false;
}

type PublishPayload = {
  desc?: string;
  tags?: string[];
  images?: { url?: string; name: string; type: string; data?: string }[];
  location?: string;
  status?: 'draft' | 'published';
};

type ValidatedPublishInput = {
  desc: string;
  rawImages: { url?: string; name: string; type: string; data?: string }[];
  tags: string[];
  status: 'draft' | 'published';
  authorId: string;
};

function mapWorkListItem(w: IWork): {
  workId: string; desc: string; tags: string[]; coverUrl: string;
  status: 'draft' | 'published'; createdAt: Date;
} {
  const cover = w.images.length > 0 ? w.images[0] : null;
  const rawCoverUrl = cover?.url ?? '/static/home/card0.png';
  const coverUrl = rawCoverUrl && rawCoverUrl.startsWith(OSS_PREFIX) ? resolveImageUrl(rawCoverUrl) : rawCoverUrl;
  return { workId: w.workId, desc: w.desc, tags: w.tags ?? [], coverUrl, status: w.status, createdAt: w.createdAt };
}

function validatePublishInput(
  payload: PublishPayload,
  userId: string | undefined,
  req: MiniappRequest,
  res: Response,
): ValidatedPublishInput | null {
  const desc = payload?.desc?.trim() ?? '';
  const rawImages = Array.isArray(payload?.images) ? payload.images : [];
  const tags = Array.isArray(payload?.tags) ? payload.tags : [];
  const status = payload?.status ?? 'published';
  if (!desc && rawImages.length === 0) {
    logRequest('work.ts:publish:validation', 'missing desc and images', {
      req, requestBody: payload, statusCode: 400,
      extra: { descLength: desc.length, imagesLength: rawImages.length },
    });
    sendErr(res, 'desc or images is required', 400);
    return null;
  }
  if (status !== 'draft' && status !== 'published') {
    logRequest('work.ts:publish:status', 'invalid status', {
      req, requestBody: payload, statusCode: 400, extra: { status },
    });
    sendErr(res, 'Invalid status', 400);
    return null;
  }
  if (!userId) {
    logRequest('work.ts:publish:author', 'missing userId (unauthorized)', {
      req, requestBody: payload, statusCode: 401, extra: { hasUserId: false },
    });
    sendErr(res, 'Unauthorized', 401);
    return null;
  }
  return { desc, rawImages, tags, status: status as 'draft' | 'published', authorId: userId };
}

async function processBase64Image(
  data: string,
  name: string,
  type: string,
  authorId: string,
  workId: string,
  index: number,
  _openId: string | undefined,
): Promise<{ url: string; name: string; type: string } | { error: string }> {
  let buffer: Buffer;
  try {
    const base64 = data.replace(/^data:image\/\w+;base64,/, '');
    buffer = Buffer.from(base64, 'base64');
  } catch {
    return { error: '图片 data 格式无效，请使用 base64' };
  }
  if (buffer.length === 0) {
    return { error: '图片 data 为空' };
  }
  const imgCheck = await checkImage(buffer, 'image/png');
  if (!imgCheck.safe) {
    return { error: '图片疑似违规，请更换后重试' };
  }
  const ext = path.extname(name).toLowerCase() || '.png';
  const safeExt = /^\.(png|jpe?g|gif|webp)$/i.test(ext) ? ext : '.png';
  const key = `images/${authorId}/${workId}-${index}${safeExt}`;
  const storedUrl = await uploadToStorage(buffer, key, 'image/png');
  return { url: storedUrl, name, type };
}

async function processPublishImages(
  rawImages: { url?: string; name: string; type: string; data?: string }[],
  authorId: string,
  workId: string,
  openId: string | undefined,
  res: Response,
): Promise<{ url: string; name: string; type: string }[] | null> {
  const images: { url: string; name: string; type: string }[] = [];
  for (let i = 0; i < rawImages.length; i++) {
    const item = rawImages[i];
    const name = item?.name ?? `image-${i}`;
    const type = item?.type ?? 'image';
    const data = typeof item?.data === 'string' ? item.data.trim() : undefined;
    const url = typeof item?.url === 'string' ? item.url.trim() : '';
    if (data) {
      const result = await processBase64Image(data, name, type, authorId, workId, i, openId);
      if ('error' in result) { sendErr(res, result.error, 400); return null; }
      images.push(result);
      continue;
    }
    if (url && isTempOrUnfetchableUrl(url)) {
      sendErr(
        res,
        '请先通过 POST /api/upload 上传图片，将返回的 url 填入发布内容；或使用 data 字段提交 base64 图片',
        400,
      );
      return null;
    }
    if (!url || !isStoredImageUrl(url)) {
      sendErr(res, '图片 url 无效，请先上传或使用 data 提交 base64', 400);
      return null;
    }
    images.push({ url, name, type });
  }
  return images;
}

function cleanupWorkImages(workId: string, work: Record<string, unknown>): void {
  const imageUrls = (work.images as { url?: string }[] | undefined)
    ?.map((img) => img?.url)
    .filter(Boolean) as string[] | undefined;
  if (!imageUrls?.length) return;
  void Promise.allSettled(imageUrls.map((url) => deleteFromStorage(url))).then((results) => {
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        logger.error(`deleteFromStorage failed for workId=${workId} url=${imageUrls[i]}`, r.reason);
      }
    });
  });
}

router.get('/list', async (req: MiniappRequest, res: Response) => {
  const userId = req.userId;
  const status = (req.query?.status as string | undefined)?.trim() as 'draft' | 'published' | undefined;

  if (!userId) {
    sendErr(res, 'Unauthorized', 401);
    return;
  }

  if (status && status !== 'draft' && status !== 'published') {
    sendErr(res, 'Invalid status', 400);
    return;
  }

  try {
    const Work = getWorkModel();
    const query: Record<string, unknown> = { authorId: userId };
    if (status) {
      query.status = status;
    }
    const works = await Work.find(query).sort({ createdAt: -1 }).lean().exec();

    const list = (works as IWork[]).map(mapWorkListItem);

    sendSucc(res, list);
  } catch (err) {
    logRequestError('work.ts:list:error', 'get work list failed', {
      req,
      requestBody: { status },
      statusCode: 500,
      extra: {
        errorName: (err as Error).name,
        errorMessage: (err as Error).message,
      },
    });
    sendErr(res, 'Get work list failed', 500);
  }
});

router.post('/publish', async (req: MiniappRequest, res: Response) => {
  const payload = (req.body?.data ?? req.body) as PublishPayload;
  logRequest('work.ts:publish:entry', 'publish request', {
    req,
    params: req.params ?? {},
    requestBody: payload,
    extra: { hasAuthorization: !!req.headers.authorization },
  });
  const validated = validatePublishInput(payload, req.userId, req, res);
  if (!validated) return;
  const { desc, rawImages, tags, status, authorId } = validated;
  try {
    const playerComp = ComponentManager.instance.getComponentByKey<PlayerComponent>('PlayerComponent');
    const openId = playerComp ? await playerComp.getOpenIdByUserId(authorId) : undefined;
    if (desc) {
      const textResult = await checkText(desc, openId);
      if (!textResult.safe) { sendErr(res, '内容包含敏感词，请修改后重试', 400); return; }
    }
    const workId = uuidv4();
    const images = await processPublishImages(rawImages, authorId, workId, openId, res);
    if (!images) return;
    const Work = getWorkModel();
    const doc = await Work.create({ workId, authorId, desc, images, tags, location: payload.location, status });
    logRequest('work.ts:publish:success', 'work published', {
      req, requestBody: payload,
      responseBody: { workId: doc.workId, authorId }, statusCode: 200,
    });
    sendSucc(res, { workId: doc.workId });
  } catch (err) {
    logRequestError('work.ts:publish:dbError', 'publish failed', {
      req, requestBody: payload, statusCode: 500,
      extra: { errorName: (err as Error).name, errorMessage: (err as Error).message },
    });
    sendErr(res, 'Publish work failed', 500);
  }
});

router.get('/detail', async (req: MiniappRequest, res: Response) => {
  const userId = req.userId;
  const workId = (req.query?.workId as string)?.trim();
  if (!userId) { sendErr(res, 'Unauthorized', 401); return; }
  if (!workId) { sendErr(res, 'Missing workId', 400); return; }

  try {
    const Work = getWorkModel();
    const work = await Work.findOne({ workId, authorId: userId }).lean().exec();
    if (!work) {
      sendErr(res, 'Work not found', 404);
      return;
    }
    const healingInfo = buildHealingResponse(work, userId);
    const images =
      Array.isArray(work.images) && work.images.length > 0
        ? (work.images as { url?: string; name?: string; type?: string }[]).map((img) => {
          const raw = (img?.url ?? '').trim();
          const url = raw && raw.startsWith(OSS_PREFIX) ? resolveImageUrl(raw) : raw;
          return { ...img, url };
        })
        : work.images;
    sendSucc(res, { ...work, images, ...healingInfo });
  } catch (err) {
    logRequestError('work.ts:detail:error', 'get work detail failed', {
      req,
      requestBody: { workId },
      statusCode: 500,
      extra: {
        errorName: (err as Error).name,
        errorMessage: (err as Error).message,
      },
    });
    sendErr(res, 'Get work detail failed', 500);
  }
});

router.post('/publishDraft', async (req: MiniappRequest, res: Response) => {
  const userId = req.userId;
  const body = (req.body?.data ?? req.body) as { workId?: string };
  const workId = body?.workId?.trim();
  if (!userId) { sendErr(res, 'Unauthorized', 401); return; }
  if (!workId) { sendErr(res, 'Missing workId', 400); return; }

  try {
    const Work = getWorkModel();
    const work = await Work.findOne({ workId }).lean().exec();
    if (!work) {
      sendErr(res, 'Work not found', 404);
      return;
    }
    if (work.authorId !== userId) {
      sendErr(res, 'Forbidden', 403);
      return;
    }
    if (work.status === 'published') {
      sendSucc(res, { workId, message: 'Already published' });
      return;
    }

    await Work.updateOne({ workId }, { $set: { status: 'published' } }).exec();
    sendSucc(res, { workId });
  } catch (err) {
    logRequestError('work.ts:publishDraft:error', 'publish draft failed', {
      req,
      requestBody: { workId },
      statusCode: 500,
      extra: {
        errorName: (err as Error).name,
        errorMessage: (err as Error).message,
      },
    });
    sendErr(res, 'Publish draft failed', 500);
  }
});

router.post('/delete', async (req: MiniappRequest, res: Response) => {
  const userId = req.userId;
  const body = (req.body?.data ?? req.body) as { workId?: string };
  const workId = body?.workId?.trim();
  if (!userId) { sendErr(res, 'Unauthorized', 401); return; }
  if (!workId) { sendErr(res, 'Missing workId', 400); return; }

  try {
    const Work = getWorkModel();
    const work = await Work.findOne({ workId }).lean().exec();
    if (!work) {
      sendErr(res, 'Work not found', 404);
      return;
    }
    if (work.authorId !== userId) {
      sendErr(res, 'Forbidden', 403);
      return;
    }

    await Work.deleteOne({ workId }).exec();
    sendSucc(res, { workId });
    cleanupWorkImages(workId, work as Record<string, unknown>);
  } catch (err) {
    logRequestError('work.ts:delete:error', 'delete work failed', {
      req,
      requestBody: { workId },
      statusCode: 500,
      extra: {
        errorName: (err as Error).name,
        errorMessage: (err as Error).message,
      },
    });
    sendErr(res, 'Delete work failed', 500);
  }
});

export default router;

