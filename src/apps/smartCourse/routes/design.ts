import { randomUUID } from 'crypto';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authenticated, type Dependencies } from '../http';
import { IdSchema } from '../schemas';
import { LIMITS } from '../config';
import { requireValue } from '../errors';
import { PatternSchema, SavePatternSchema, ExportPatternSchema } from '../pattern/validation';
import { normalizePatternImage } from '../pattern/images';
import { renderPattern } from '../pattern/renderer';
import { assetView, designResponse, exportDesign, ownedPatternAssets, patternAccess,
  saveDesign } from '../services/patternDesign';
const PreviewSchema = z.object({ state: PatternSchema, ringIndex: z.union([z.literal(0), z.literal(1)]) }).strict();
export function designRoutes(deps: Dependencies) {
  const router = Router();
  const auth = (action: Parameters<typeof authenticated>[2]) => authenticated(deps, 'student', action);
  router.get('/courses/:courseId/design', auth(async (req, res, session) => {
    const id = IdSchema.parse(req.params.courseId); await patternAccess(deps, id, session);
    res.json(await designResponse(deps, id, session.id));
  }));
  addSavedPreview(router, deps);
  router.put('/courses/:courseId/design', auth(async (req, res, session) => {
    const id = IdSchema.parse(req.params.courseId); const { revision, state } = SavePatternSchema.parse(req.body);
    res.json(await saveDesign(deps, id, session, revision, state));
  }));
  router.post('/courses/:courseId/design/preview', auth(async (req, res, session) => {
    const id = IdSchema.parse(req.params.courseId); await patternAccess(deps, id, session, true);
    const { state, ringIndex } = PreviewSchema.parse(req.body);
    await deps.access.rate(`preview:${session.id}`, 180);
    const preview = await deps.access.withLock(`preview:${id}:${session.id}`, async () => {
      const assets = await ownedPatternAssets(deps, id, session.id, state);
      return (await renderPattern(state, assets, undefined, ringIndex)).preview;
    });
    res.json(preview);
  }));
  router.post('/courses/:courseId/design/export', auth(async (req, res, session) => {
    const id = IdSchema.parse(req.params.courseId); const { revision } = ExportPatternSchema.parse(req.body);
    await deps.access.rate(`export:${session.id}`, LIMITS.loginAttempts);
    res.json(await exportDesign(deps, id, session, revision));
  }));
  addAssetRoute(router, deps);
  return router;
}
function addAssetRoute(router: Router, deps: Dependencies) {
  const upload = multer({ storage: multer.memoryStorage(), limits: {
    fileSize: LIMITS.uploadBytes, files: 1, fields: 0,
  } }).single('image');
  router.post('/courses/:courseId/design/assets', (req, res, next) => {
    authenticated(deps, 'student', async (_req, _res, session) => {
      await patternAccess(deps, IdSchema.parse(req.params.courseId), session, true);
      await deps.access.rate(`pattern-upload:${session.id}`, LIMITS.loginAttempts);
      upload(req, res, next);
    })(req, res, next);
  }, authenticated(deps, 'student', async (req, res, session) => {
    const id = IdSchema.parse(req.params.courseId); await patternAccess(deps, id, session, true);
    const file = requireValue(req.file, '请选择纹样图片');
    const { data, info } = await normalizePatternImage(file.buffer);
    const assetId = randomUUID();
    const objectKey = await deps.storage.uploadPng(data, id, session.id, `originals/${assetId}`);
    try {
      const asset = await deps.repo.addPatternAsset({ assetId, courseId: id, participantId: session.id,
        objectKey, width: info.width, height: info.height });
      res.status(201).json(assetView(asset, deps));
    } catch (error) { await deps.storage.remove(objectKey).catch(() => undefined); throw error; }
  }));
}

function addSavedPreview(router: Router, deps: Dependencies) {
  router.get('/courses/:courseId/design/preview', authenticated(deps, 'student', async (req, res, session) => {
    const id = IdSchema.parse(req.params.courseId); await patternAccess(deps, id, session);
    const design = requireValue(await deps.repo.patternDesign(id, session.id));
    const state = PatternSchema.parse(JSON.parse(design.stateJson));
    await deps.access.rate(`preview:${session.id}`, 180);
    const preview = await deps.access.withLock(`preview:${id}:${session.id}`, async () => {
      const assets = await ownedPatternAssets(deps, id, session.id, state);
      return (await renderPattern(state, assets)).preview;
    });
    res.json(preview);
  }));
}
