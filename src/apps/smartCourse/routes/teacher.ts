import { ceramicViews } from '../services/ceramic';
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { handle, authenticated, teacherToken, type Dependencies } from '../http';
import { API_PREFIX, LIMITS, TEACHER_COOKIE } from '../config';
import { CourseInput, IdSchema, LoginInput, StatusInput } from '../schemas';
import { SmartCourseError, requireValue } from '../errors';
import { designView, assetView } from '../services/patternDesign';
import { artworkView, courseView, ownedCourse } from '../services/courses';

export function teacherRoutes(deps: Dependencies) {
  const router = Router();
  const auth = (action: Parameters<typeof authenticated>[2]) => authenticated(deps, 'teacher', action);
  router.post('/login', handle(async (req, res) => {
    await deps.access.rate(`login:${req.ip}`, LIMITS.loginAttempts);
    const { username, password } = LoginInput.parse(req.body);
    const teacher = await deps.repo.teacher(username);
    if (!teacher || !await bcrypt.compare(password, teacher.passwordHash)) {
      throw new SmartCourseError(401, 'LOGIN_FAILED', '账号或密码不正确');
    }
    const token = await deps.access.issue({ role: 'teacher', id: teacher.teacherId });
    res.cookie(TEACHER_COOKIE, token, { ...cookieOptions(deps), maxAge: LIMITS.sessionSeconds * 1000 });
    res.json({ teacherId: teacher.teacherId });
  }));
  router.get('/me', auth(async (_req, res, session) => res.json({ teacherId: session.id })));
  router.post('/logout', auth(async (req, res) => {
    await deps.access.revoke(teacherToken(req));
    res.clearCookie(TEACHER_COOKIE, cookieOptions(deps));
    res.json({ success: true });
  }));
  router.get('/courses', auth(async (_req, res, session) => {
    const courses = await deps.repo.courses(session.id);
    res.json({ courses: courses.map(course => courseView(course, true)),
      agentReady: Boolean(deps.config.SMARTCOURSE_BAILIAN_APP_ID && deps.config.SMARTCOURSE_BAILIAN_API_KEY),
      agentVersion: deps.config.SMARTCOURSE_AGENT_VERSION });
  }));
  addCourseRoutes(router, deps);
  return router;
}
function cookieOptions(deps: Dependencies) {
  return { httpOnly: true, secure: new URL(deps.config.SMARTCOURSE_ORIGIN).protocol === 'https:',
    sameSite: 'strict' as const, path: `${API_PREFIX}/teacher` };
}
function addCourseRoutes(router: Router, deps: Dependencies) {
  const auth = (action: Parameters<typeof authenticated>[2]) => authenticated(deps, 'teacher', action);
  router.post('/courses', auth(async (req, res, session) => {
    const input = CourseInput.parse(req.body);
    const appId = deps.config.SMARTCOURSE_BAILIAN_APP_ID;
    if (!appId) throw new SmartCourseError(503, 'AGENT_NOT_CONFIGURED', '请先配置课程助教');
    const course = await deps.repo.createCourse({ ...input, teacherId: session.id, appId,
      agentVersion: deps.config.SMARTCOURSE_AGENT_VERSION });
    res.status(201).json(courseView(course, true));
  }));
  router.patch('/courses/:courseId', auth(async (req, res, session) => {
    const id = IdSchema.parse(req.params.courseId);
    const course = await ownedCourse(deps.repo, id, session.id);
    const { status } = StatusInput.parse(req.body);
    const previous = status === 'open' ? 'draft' : 'open';
    if (course.status !== previous) throw new SmartCourseError(409, 'STATUS', '课程状态已改变，请刷新');
    const updated = requireValue(await deps.repo.setStatus(id, session.id, status, previous));
    res.json(courseView(updated, true));
  }));
  router.get('/courses/:courseId', auth(async (req, res, session) => {
    const id = IdSchema.parse(req.params.courseId);
    const course = await ownedCourse(deps.repo, id, session.id);
    const [participants, artworks] = await Promise.all([deps.repo.participants(id), deps.repo.artworks(id)]);
    const designs = await Promise.all((await deps.repo.patternDesigns(id)).map(async design => ({
      ...designView(design, deps), ceramics: await ceramicViews(deps, id, design.participantId),
      participantId: design.participantId,
      assets: (await deps.repo.patternAssets(id, design.participantId)).map(asset => assetView(asset, deps)),
    })));
    res.json({ designs, course: courseView(course, true), participants: participants.map(p => ({
      participantId: p.participantId, completed: p.completed, createdAt: p.createdAt,
    })), artworks: artworks.map(artwork => artworkView(artwork, deps.storage.sign)) });
  }));
}
