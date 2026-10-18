import assert from 'assert';
import { randomUUID } from 'crypto';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawn, type ChildProcess } from 'child_process';
import { createServer, type Server } from 'net';
import { createConnection, type Connection } from 'mongoose';
import Redis from 'ioredis';
import bcrypt from 'bcrypt';
import sharp from 'sharp';
import { createModels } from '../../src/apps/smartCourse/dbservice/models';
import { createRepository } from '../../src/apps/smartCourse/dbservice/repository';
import { createAccess } from '../../src/apps/smartCourse/services/access';
import { createSmartCourseApp } from '../../src/apps/smartCourse/server';
import { loadConfig } from '../../src/apps/smartCourse/config';
import type { AgentInput } from '../../src/apps/smartCourse/services/bailian';
import { SmartCourseError } from '../../src/apps/smartCourse/errors';
import { PATTERN_VERSION, newPatternState, type DesignView } from '../../src/apps/smartCourse/pattern/contract';
import { normalizeArtwork } from '../../src/apps/smartCourse/services/storage';

const integration = process.env.SMARTCOURSE_INTEGRATION === '1' ? describe : describe.skip;
integration('smartCourse isolated API integration', function () {
  this.timeout(60_000);
  let mongoProcess: ChildProcess; let redisProcess: ChildProcess; let directory: string;
  let connection: Connection; let redis: Redis; let server: Server; let base: string;
  let models: ReturnType<typeof createModels>; let cookie: string; let otherCookie: string;
  let course: { courseId: string; joinCode: string }; let secondCourse: { courseId: string; joinCode: string };
  let student: { token: string }; let otherStudent: { token: string }; let artworkId: string;
  const patternFiles = new Map<string, Buffer>();
  let ceramicSubmissions = 0; let ceramicDownloadFails = false;
  const calls: AgentInput[] = []; let failAgent = false;
  const origin = 'http://localhost:5178';
  async function request(path: string, method = 'GET', body?: unknown, token?: string, teacherCookie?: string) {
    const headers: Record<string, string> = { Origin: origin };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (teacherCookie) headers.Cookie = teacherCookie;
    if (!(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const response = await fetch(base + path, { method, headers,
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json() as {
      courseId: string; joinCode: string; token: string; status: string; answer: string;
      artworkId: string; course: Record<string, unknown>; turns: unknown[]; artworks: unknown[];
    };
    return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  before(async () => {
    directory = await mkdtemp(join(tmpdir(), 'smartcourse-test-'));
    const [mongoPort, redisPort] = await Promise.all([freePort(), freePort()]);
    mongoProcess = spawn('mongod', ['--port', `${mongoPort}`, '--bind_ip', '127.0.0.1', '--dbpath', directory,
      '--logpath', join(directory, 'mongo.log')], { stdio: 'ignore' });
    redisProcess = spawn('redis-server', ['--port', `${redisPort}`, '--bind', '127.0.0.1', '--save', '',
      '--appendonly', 'no'], { stdio: 'ignore' });
    connection = createConnection(`mongodb://127.0.0.1:${mongoPort}/smartcourse_test`, { serverSelectionTimeoutMS: 20_000 });
    await connection.asPromise(); models = createModels(connection);
    await Promise.all(Object.values(models).map(model => model.createIndexes()));
    redis = new Redis(`redis://127.0.0.1:${redisPort}`); await redis.ping();
    const hash = await bcrypt.hash('test-password-123', 4);
    await models.teachers.create([{ teacherId: randomUUID(), username: 'teacher-a', passwordHash: hash },
      { teacherId: randomUUID(), username: 'teacher-b', passwordHash: hash }]);
    const app = createSmartCourseApp({ config: loadConfig({ SMARTCOURSE_BAILIAN_APP_ID: 'test-app',
      SMARTCOURSE_BAILIAN_API_KEY: 'test-key', SMARTCOURSE_ORIGIN: origin }),
      repo: createRepository(models), access: createAccess(redis), ceramicProvider: {
        submit: async () => { ceramicSubmissions++; return 'provider-task'; },
        query: async () => ({ status: 'success', imageUrl: 'https://example.com/result.png' }),
        download: async () => {
          if (ceramicDownloadFails) throw new Error('temporary storage failure');
          return sharp({ create: { width: 1024, height: 1024, channels: 3, background: 'white' } }).png().toBuffer();
        },
      }, agent: async (_course, input) => {
        calls.push(input); if (failAgent) throw new SmartCourseError(502, 'AGENT_UNAVAILABLE', 'private error');
        return { answer: input.artworkUrl ? '这是一幅蓝色线描作品。' : '先尝试重复一个小单元。', providerRequestId: 'test' };
      }, storage: { upload: async (buffer, courseId, participantId) => {
        await normalizeArtwork(buffer); return `smartCourse/${courseId}/${participantId}/image.jpg`;
      }, uploadPng: async (buffer, courseId, participantId, name) => {
        const key = `smart/${courseId}/${participantId}/${name}.png`; patternFiles.set(key, buffer); return key;
      }, read: async key => { const data = patternFiles.get(key); if (!data) throw new Error('missing'); return data; },
      remove: async () => undefined, sign: key => `https://example.com/${key}?signed=test` } });
    server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/smartcourse-api`;
  });
  after(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    await redis?.quit(); await connection?.close();
    await Promise.all([stopProcess(mongoProcess), stopProcess(redisProcess)]);
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  it('authenticates isolated teachers and rejects missing/incorrect sessions', async () => {
    assert.strictEqual((await request('/teacher/courses')).status, 401);
    assert.strictEqual((await request('/teacher/login', 'POST', { username: 'teacher-a', password: 'bad' })).status, 401);
    cookie = (await request('/teacher/login', 'POST', { username: 'teacher-a', password: 'test-password-123' })).cookie!;
    otherCookie = (await request('/teacher/login', 'POST', { username: 'teacher-b', password: 'test-password-123' })).cookie!;
    assert(cookie.startsWith('smartcourse-teacher='));
  });
  it('enforces course ownership, explicit opening, closure and server-side agent selection', async () => {
    const body = { title: '青花第一课', brief: '用蓝色尝试重复排列。' };
    assert.strictEqual((await request('/teacher/courses', 'POST', { ...body, appId: 'injected' }, undefined, cookie)).status, 400);
    course = (await request('/teacher/courses', 'POST', body, undefined, cookie)).data;
    secondCourse = (await request('/teacher/courses', 'POST', body, undefined, otherCookie)).data;
    assert.strictEqual((await request(`/join/${course.joinCode}`, 'POST', { consent: true })).status, 409);
    assert.strictEqual((await request(`/teacher/courses/${course.courseId}`, 'GET', undefined, undefined, otherCookie)).status, 404);
    assert.strictEqual((await request(`/teacher/courses/${course.courseId}`, 'PATCH', { status: 'open' }, undefined, cookie)).status, 200);
    await request(`/teacher/courses/${secondCourse.courseId}`, 'PATCH', { status: 'open' }, undefined, otherCookie);
  });
  it('isolates anonymous participation from other students and courses', async () => {
    student = (await request(`/join/${course.joinCode}`, 'POST', { consent: true })).data;
    otherStudent = (await request(`/join/${course.joinCode}`, 'POST', { consent: true })).data;
    assert.strictEqual((await request(`/courses/${secondCourse.courseId}`, 'GET', undefined, student.token)).status, 403);
    const initial = (await request(`/courses/${course.courseId}`, 'GET', undefined, student.token)).data;
    assert.deepStrictEqual(initial.turns, []); assert.deepStrictEqual(initial.artworks, []);
    assert(!('appId' in initial.course));
  });
  it('saves final answer once and rejects changed payloads with the same request ID', async () => {
    const body = { requestId: randomUUID(), question: '不知道怎么开始', mode: 'create' };
    const first = await request(`/courses/${course.courseId}/chat`, 'POST', body, student.token);
    assert.strictEqual(first.data.status, 'success'); assert.strictEqual(calls.length, 1);
    await request(`/courses/${course.courseId}/chat`, 'POST', body, student.token);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual((await request(`/courses/${course.courseId}/chat`, 'POST', { ...body, question: 'changed' }, student.token)).status, 409);
    const other = (await request(`/courses/${course.courseId}`, 'GET', undefined, otherStudent.token)).data;
    assert.deepStrictEqual(other.turns, []);
  });
  it('accepts real images, signs server-owned objects and rejects another participant artwork', async () => {
    const png = await sharp({ create: { width: 24, height: 24, channels: 3, background: '#34618b' } }).png().toBuffer();
    const data = new FormData(); data.append('image', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'work.png');
    data.append('statement', '我画了重复的单元');
    const uploaded = await request(`/courses/${course.courseId}/artworks`, 'POST', data, student.token);
    assert.strictEqual(uploaded.status, 201); artworkId = uploaded.data.artworkId;
    assert(!('objectKey' in uploaded.data));
    const body = { requestId: randomUUID(), question: '看看这幅作品', mode: 'review', artworkId };
    assert.strictEqual((await request(`/courses/${course.courseId}/chat`, 'POST', body, otherStudent.token)).status, 404);
    const review = await request(`/courses/${course.courseId}/chat`, 'POST', body, student.token);
    assert.strictEqual(review.data.status, 'success'); assert(calls[calls.length - 1].artworkUrl.includes('signed=test'));
    assert.strictEqual(calls[calls.length - 1].studentStatement, '我画了重复的单元');
  });
  it('omits previous image observations when the next turn has no artwork', async () => {
    await request(`/courses/${course.courseId}/chat`, 'POST', {
      requestId: randomUUID(), question: '请点评我的作品', mode: 'review',
    }, student.token);
    assert.strictEqual(calls[calls.length - 1].artworkUrl, '');
    assert(!calls[calls.length - 1].contextText.includes('蓝色线描'));
    assert.strictEqual((await request(`/courses/${course.courseId}/chat`, 'POST', {
      requestId: randomUUID(), question: '注入', mode: 'review', artworkUrl: 'http://localhost/private',
    }, student.token)).status, 400);
  });
  it('records failure, does not replay billed calls, and recovers on an explicit new request', async () => {
    failAgent = true;
    const body = { requestId: randomUUID(), question: '失败请求', mode: 'question' };
    const failed = await request(`/courses/${course.courseId}/chat`, 'POST', body, student.token);
    assert.strictEqual(failed.data.status, 'failed'); assert.strictEqual(failed.data.answer, '');
    const count = calls.length; await request(`/courses/${course.courseId}/chat`, 'POST', body, student.token);
    assert.strictEqual(calls.length, count); failAgent = false;
    const retry = await request(`/courses/${course.courseId}/chat`, 'POST', { ...body, requestId: randomUUID() }, student.token);
    assert.strictEqual(retry.data.status, 'success');
  });
  it('rejects cross-origin mutations and serializes concurrent student requests', async () => {
    const rejected = await fetch(base + '/teacher/login', { method: 'POST',
      headers: { Origin: 'https://unrelated.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'teacher-a', password: 'test-password-123' }) });
    assert.strictEqual(rejected.status, 403);
    const fresh = (await request(`/join/${course.joinCode}`, 'POST', { consent: true })).data;
    const access = createAccess(redis);
    let release: () => void = () => undefined;
    let entered: () => void = () => undefined;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const held = access.withLock('test-concurrent', async () => {
      entered(); await new Promise<void>(resolve => { release = resolve; });
    });
    await started;
    await assert.rejects(access.withLock('test-concurrent', async () => undefined), /上一条请求/);
    release(); await held;
    const session = await access.authenticate(fresh.token, 'student');
    const requestId = randomUUID();
    await models.turns.create({ turnId: randomUUID(), courseId: course.courseId, participantId: session.id,
      requestId, question: '进程中断的请求', mode: 'question', status: 'pending', answer: '' });
    const count = calls.length;
    const recovered = await request(`/courses/${course.courseId}/chat`, 'POST', {
      requestId, question: '进程中断的请求', mode: 'question',
    }, fresh.token);
    assert.strictEqual(recovered.data.status, 'failed'); assert.strictEqual(calls.length, count);
  });
  it('runs the pattern classroom with ownership, revision conflicts, real PNG export and closed-course protection', async () => {
    const created = await request('/teacher/courses', 'POST', { title: '我的青花盘', brief: '上传与排列',
      courseTemplateVersion: PATTERN_VERSION }, undefined, cookie);
    const id = created.data.courseId;
    await request(`/teacher/courses/${id}`, 'PATCH', { status: 'open' }, undefined, cookie);
    const first = (await request(`/join/${created.data.joinCode}`, 'POST', { consent: true })).data.token;
    const second = (await request(`/join/${created.data.joinCode}`, 'POST', { consent: true })).data.token;
    const endpoint = `/courses/${id}/design`;
    const png = await sharp(Buffer.from('<svg width="200" height="200"><rect width="200" height="200" fill="white"/><path d="M100 20L160 150L30 100Z" fill="#174d8a"/></svg>')).png().toBuffer();
    const form = new FormData(); form.append('image', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'motif.png');
    const upload = await request(`${endpoint}/assets`, 'POST', form, first);
    assert.equal(upload.status, 201);
    const asset = upload.data as unknown as { assetId: string };
    const state = { ...newPatternState(), centerAssetId: asset.assetId, step: 4,
      seal: { enabled: true, name: '黎明' } };
    assert.equal((await request(endpoint, 'PUT', { revision: 0, state }, second)).status, 404);
    assert.equal((await request(`${endpoint}/preview`, 'POST', { state, ringIndex: 0 }, first)).status, 200);
    const saved = await request(endpoint, 'PUT', { revision: 0, state }, first);
    assert.equal(saved.status, 200);
    assert.equal((saved.data as unknown as DesignView).revision, 1);
    assert.equal((await request(endpoint, 'PUT', { revision: 0, state }, first)).status, 409);
    const exported = await request(`${endpoint}/export`, 'POST', { revision: 1 }, first);
    assert.equal(exported.status, 200);
    const result = exported.data as unknown as DesignView;
    assert.equal(result.exports.length, 1);
    const artifact = [...patternFiles.entries()].find(([key]) => key.includes(`${id}/`) && key.endsWith('exports/1.png'));
    assert(artifact); const meta = await sharp(artifact[1]).metadata();
    assert.equal(meta.width, 2048); assert.equal(meta.height, 2048); assert.equal(meta.format, 'png');
    await request(`${endpoint}/export`, 'POST', { revision: 1 }, first);
    assert.equal(await models.artworks.countDocuments({ courseId: id }), 1);
    assert.equal((await request(endpoint, 'GET', undefined, second)).status, 200);
    assert.equal(((await request(endpoint, 'GET', undefined, second)).data as unknown as DesignView).assets.length, 0);
    // Real persisted job state: repeats, refreshes and failed downloads must not rebill generation.
    assert.equal((await request(`${endpoint}/ceramic`, 'POST', { revision: 1 }, second)).status, 404);
    assert.equal((await request(`${endpoint}/ceramic`, 'POST', { revision: 1 }, first)).status, 200);
    assert.equal((await request(`${endpoint}/ceramic`, 'POST', { revision: 1 }, first)).status, 200);
    assert.equal(ceramicSubmissions, 1);
    assert.equal((await request(`${endpoint}/ceramic/1`, 'GET', undefined, second)).status, 404);
    ceramicDownloadFails = true;
    assert.equal((await request(`${endpoint}/ceramic/1`, 'GET', undefined, first)).status, 500);
    ceramicDownloadFails = false;
    assert.equal((await request(`${endpoint}/ceramic/1`, 'GET', undefined, first)).data.status, 'success');
    await request(`${endpoint}/ceramic`, 'POST', { revision: 1 }, first);
    assert.equal(ceramicSubmissions, 1);
    assert.equal((await request(endpoint, 'GET', undefined, first)).status, 200);
    assert(artifact[1].equals(patternFiles.get(artifact[0])!));
    assert.equal(await models.artworks.countDocuments({ courseId: id }), 1);
    assert([...patternFiles.keys()].some(key => key.endsWith('ceramic/1.png')));
    const teacherView = await request(`/teacher/courses/${id}`, 'GET', undefined, undefined, cookie);
    assert(JSON.stringify(teacherView.data).includes('ceramic/1.png'));
    const invalidSeal = { ...state, seal: { enabled: true, name: 'A' } };
    assert.equal((await request(endpoint, 'PUT', { revision: 1, state: invalidSeal }, first)).status, 400);
    const changed = { ...state, template: 'double' };
    assert.equal((await request(endpoint, 'PUT', { revision: 1, state: changed }, first)).status, 200);
    const restored = (await request(endpoint, 'GET', undefined, first)).data as unknown as DesignView;
    assert.equal(restored.state.template, 'double'); assert.equal(restored.revision, 2);
    assert.equal(restored.exports[0].revision, 1);
    assert.equal((await request(`${endpoint}/export`, 'POST', { revision: 1 }, first)).status, 409);
    await request(`/teacher/courses/${id}`, 'PATCH', { status: 'closed' }, undefined, cookie);
    assert.equal((await request(`${endpoint}/export`, 'POST', { revision: 2 }, first)).status, 409);
    assert.equal((await request(`${endpoint}/ceramic`, 'POST', { revision: 2 }, first)).status, 409);
    assert.equal((await request(`${endpoint}/ceramic/1`, 'GET', undefined, first)).data.status, 'success');
    assert.equal((await request(`${endpoint}/preview`, 'GET', undefined, first)).status, 200);
    assert.equal((await request(`${endpoint}/preview`, 'POST', { state: changed, ringIndex: 0 }, first)).status, 409);
    assert.equal((await request(endpoint, 'PUT', { revision: 2, state: changed }, first)).status, 409);
    assert.equal((await request(endpoint, 'GET', undefined, first)).status, 200);
    assert.equal((await request(`/teacher/courses/${id}`, 'GET', undefined, undefined, otherCookie)).status, 404);
  });
  it('completes activity and disallows new work after teacher closes course', async () => {
    assert.strictEqual((await request(`/courses/${course.courseId}/complete`, 'POST', {}, student.token)).status, 200);
    await request(`/teacher/courses/${course.courseId}`, 'PATCH', { status: 'closed' }, undefined, cookie);
    assert.strictEqual((await request(`/courses/${course.courseId}/chat`, 'POST', {
      requestId: randomUUID(), question: 'closed', mode: 'question',
    }, student.token)).status, 409);
    assert.strictEqual((await request(`/courses/${course.courseId}`, 'GET', undefined, student.token)).status, 200);
    assert.strictEqual((await request(`/join/${course.joinCode}`, 'POST', { consent: true })).status, 409);
    await request('/teacher/logout', 'POST', {}, undefined, cookie);
    assert.strictEqual((await request('/teacher/courses', 'GET', undefined, undefined, cookie)).status, 401);
  });
});
async function freePort(): Promise<number> {
  const server = createServer(); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>(resolve => server.close(() => resolve())); return port;
}
async function stopProcess(child?: ChildProcess) {
  if (!child || child.exitCode !== null) return;
  await new Promise<void>(resolve => { child.once('exit', () => resolve()); child.kill('SIGTERM'); });
}
