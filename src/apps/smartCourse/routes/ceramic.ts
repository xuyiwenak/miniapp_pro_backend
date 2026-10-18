import { Router } from 'express';
import { z } from 'zod';
import { authenticated, type Dependencies } from '../http';
import { IdSchema } from '../schemas';
import { ExportPatternSchema } from '../pattern/validation';
import { patternAccess } from '../services/patternDesign';
import { ceramicViews, refreshCeramic, startCeramic } from '../services/ceramic';
const RevisionSchema = z.coerce.number().int().positive();
export function ceramicRoutes(deps: Dependencies) {
  const router = Router();
  const auth = (action: Parameters<typeof authenticated>[2]) => authenticated(deps, 'student', action);
  router.get('/courses/:courseId/design/ceramic', auth(async (req, res, session) => {
    const id = IdSchema.parse(req.params.courseId); await patternAccess(deps, id, session);
    res.json(await ceramicViews(deps, id, session.id));
  }));
  router.post('/courses/:courseId/design/ceramic', auth(async (req, res, session) => {
    const id = IdSchema.parse(req.params.courseId); const { revision } = ExportPatternSchema.parse(req.body);
    res.json(await startCeramic(deps, id, session, revision));
  }));
  router.get('/courses/:courseId/design/ceramic/:revision', auth(async (req, res, session) => {
    const id = IdSchema.parse(req.params.courseId); await patternAccess(deps, id, session);
    await deps.access.rate(`ceramic-poll:${session.id}`, 30);
    res.json(await refreshCeramic(deps, id, session.id, RevisionSchema.parse(req.params.revision)));
  }));
  return router;
}
