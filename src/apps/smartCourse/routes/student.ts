import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authenticated, handle, type Dependencies } from '../http';
import { LIMITS, configuredCapabilities } from '../config';
import { ChatInput, IdSchema, JoinInput, StatementInput } from '../schemas';
import { requireValue } from '../errors';
import { assertOpen, artworkView, courseView, studentCourse, turnView } from '../services/courses';
import { createChatService } from '../services/chat';

export function studentRoutes(deps: Dependencies) {
  const router = Router();
  router.get('/join/:code', handle(async (req, res) => {
    const code = z.string().regex(/^[a-zA-Z0-9_-]{24}$/).parse(req.params.code);
    const course = requireValue(await deps.repo.courseByCode(code));
    res.json(courseView(course));
  }));
  router.post('/join/:code', handle(async (req, res) => {
    JoinInput.parse(req.body);
    await deps.access.rate(`join:${req.ip}`, LIMITS.loginAttempts);
    const code = z.string().regex(/^[a-zA-Z0-9_-]{24}$/).parse(req.params.code);
    const course = requireValue(await deps.repo.courseByCode(code));
    assertOpen(course);
    const participant = await deps.repo.join(course.courseId);
    const token = await deps.access.issue({
      role: 'student', id: participant.participantId, courseId: course.courseId,
    });
    res.status(201).json({ token, course: courseView(course) });
  }));
  addParticipationRoutes(router, deps);
  addArtworkRoute(router, deps);
  return router;
}
function addParticipationRoutes(router: Router, deps: Dependencies) {
  const auth = (action: Parameters<typeof authenticated>[2]) => authenticated(deps, 'student', action);
  const chat = createChatService(deps);
  router.get('/courses/:courseId', auth(async (req, res, session) => {
    const id = IdSchema.parse(req.params.courseId);
    const { course, participant } = await studentCourse(deps.repo, id, session);
    const [artworks, turns] = await Promise.all([deps.repo.artworks(id, session.id), deps.repo.turns(id, session.id)]);
    res.json({ ...configuredCapabilities(deps.config), course: courseView(course), completed: participant.completed,
      artworks: artworks.map(artwork => artworkView(artwork, deps.storage.sign)),
      turns: turns.map(turnView).reverse() });
  }));
  router.post('/courses/:courseId/complete', auth(async (req, res, session) => {
    const id = IdSchema.parse(req.params.courseId);
    const { course } = await studentCourse(deps.repo, id, session);
    assertOpen(course);
    await deps.repo.complete(session.id, id);
    res.json({ success: true });
  }));
  router.post('/courses/:courseId/chat', auth(async (req, res, session) => {
    const id = IdSchema.parse(req.params.courseId);
    const { course } = await studentCourse(deps.repo, id, session);
    assertOpen(course);
    const input = ChatInput.parse(req.body);
    res.json(turnView(await chat(course, session.id, input)));
  }));
}
function addArtworkRoute(router: Router, deps: Dependencies) {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LIMITS.uploadBytes, files: 1,
    fields: 1, fieldSize: 4000 } }).single('image');
  // Authenticate and check course before buffering an uploaded file.
  router.post('/courses/:courseId/artworks', (req, res, next) => {
    authenticated(deps, 'student', async (_req, _res, session) => {
      const { course } = await studentCourse(deps.repo, IdSchema.parse(req.params.courseId), session);
      assertOpen(course);
      await deps.access.rate(`upload:${session.id}`, LIMITS.loginAttempts);
      upload(req, res, next);
    })(req, res, next);
  }, authenticated(deps, 'student', async (req, res, session) => {
    const id = IdSchema.parse(req.params.courseId);
    const statement = StatementInput.parse(req.body.statement);
    const file = requireValue(req.file, '请选择作品图片');
    const key = await deps.storage.upload(file.buffer, id, session.id);
    try {
      const artwork = await deps.repo.addArtwork({
        courseId: id, participantId: session.id, objectKey: key, statement,
      });
      res.status(201).json(artworkView(artwork, deps.storage.sign));
    } catch (error) {
      await deps.storage.remove(key).catch(() => undefined);
      throw error;
    }
  }));
}
