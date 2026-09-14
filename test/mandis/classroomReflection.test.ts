import { strict as assert } from 'assert';
import { randomUUID, createHmac } from 'crypto';
import express from 'express';
import { model, models as mongooseModels } from 'mongoose';
import sinon from 'sinon';
import type { Server } from 'http';
import * as db from '../../src/dbservice/model/GlobalInfoDBModel';
import { ClassroomParticipationSchema, type IClassroomParticipation }
  from '../../src/apps/mandis/entity/classroomParticipation.entity';
import { IntentionSubmitInput, EvaluationSubmitInput, normalizeModuleResponses, assertCanViewReport }
  from '../../src/apps/mandis/miniapp/services/classroomReflection';
import { describeFeedback, reflectionWideRow }
  from '../../src/apps/mandis/miniapp/services/classroomReflectionExport';
import { withClassroomWrite, assertClassroomWritable }
  from '../../src/apps/mandis/miniapp/services/classroomWriteBoundary';
import { hashToken } from '../../src/apps/mandis/miniapp/services/classroomResearch';
import { buildOssPutOptions } from '../../src/util/ossUploader';
import { finalizeClassroom } from '../../src/apps/mandis/miniapp/services/classroomLifecycle';
import { hasClassroomCapability } from '../../src/apps/mandis/miniapp/services/classroomAccess';
import type { IClassroom } from '../../src/apps/mandis/entity/classroom.entity';
import router from '../../src/apps/mandis/miniapp/routes/classroomParticipation';

const TOKEN = 'a'.repeat(43);
const RUN_ID = randomUUID();
const INTENTION = { intendedEmotions: ['calm'], expressionConfidence: 6, intentionText: 'private intention' };
const EVALUATION = { analysisRunId: RUN_ID, reportVersion: RUN_ID, feedbackOverallHelpful: 6,
  feedbackReflectionHelp: 5, feedbackDiscomfort: 1,
  moduleResponses: { color: { responseCode: 'strongly_matches', missingReason: null } },
  overallComment: 'private comment' };
const ParticipantModel = mongooseModels.ReflectionTestParticipant
  ?? model<IClassroomParticipation>('ReflectionTestParticipant', ClassroomParticipationSchema);

describe('classroom reflection validation', () => {
  it('signs explicit private object ACL without changing general uploads', () => {
    const config = { region: 'oss-cn-test', bucket: 'bucket', accessKeyId: 'test', accessKeySecret: 'secret',
      worksObjectPrefix: 'works', avatarObjectPrefix: 'avatars' };
    const options = buildOssPutOptions(config, 'works/a.jpg', 'image/jpeg', 'md5', 'date', true);
    const headers = options.headers as Record<string, string>;
    assert.equal(headers['x-oss-object-acl'], 'private');
    const signature = createHmac('sha1', 'secret')
      .update('PUT\nmd5\nimage/jpeg\ndate\nx-oss-object-acl:private\n/bucket/works/a.jpg').digest('base64');
    assert.equal(headers.Authorization, `OSS test:${signature}`);
    const general = buildOssPutOptions(config, 'works/a.jpg', 'image/jpeg', 'md5', 'date');
    assert.equal((general.headers as Record<string, string>)['x-oss-object-acl'], undefined);
  });
  it('gives collaborators summary only unless a capability was explicitly granted', () => {
    const c = { createdByTeacherId: 'owner', authorizedTeacherIds: ['colleague'],
      capabilityGrants: [{ teacherId: 'colleague', capabilities: ['detail'] }] } as IClassroom;
    assert.equal(hasClassroomCapability(c, 'colleague', 'summary'), true);
    assert.equal(hasClassroomCapability(c, 'colleague', 'detail'), true);
    assert.equal(hasClassroomCapability(c, 'colleague', 'sensitiveExport'), false);
    assert.equal(hasClassroomCapability(c, 'stranger', 'summary'), false);
  });
  it('collects emotions without a second VAD and requires unique emotions and other text', () => {
    assert.equal(IntentionSubmitInput.safeParse(INTENTION).success, true);
    for (const patch of [{ intendedValence: 0 }, { intendedArousal: 2.5 },
      { intendedEmotions: ['calm', 'calm'] }, { intendedEmotions: ['other'] }]) {
      assert.equal(IntentionSubmitInput.safeParse({ ...INTENTION, ...patch }).success, false);
    }
  });
  it('requires explicit three-way responses for every displayed module', () => {
    assert.equal(EvaluationSubmitInput.safeParse(EVALUATION).success, true);
    assert.equal(EvaluationSubmitInput.safeParse({ ...EVALUATION, feedbackDiscomfort: 8 }).success, false);
    assert.equal(EvaluationSubmitInput.safeParse({ ...EVALUATION,
      moduleResponses: { color: { responseCode: 'cannot_judge', missingReason: null } } }).success, false);
    const input = EvaluationSubmitInput.parse(EVALUATION);
    const result = normalizeModuleResponses(input, ['color', 'suggestion']);
    assert.equal(result.color?.responseCode, 'strongly_matches');
    assert.equal(result.suggestion?.missingReason, 'not_answered');
    assert.equal(result.embeddedText?.missingReason, 'not_shown');
    assert.throws(() => normalizeModuleResponses(input, ['color', 'suggestion'], true), /MODULE_RESPONSE_REQUIRED/);
    const complete = EvaluationSubmitInput.parse({ ...EVALUATION, moduleResponses: {
      ...EVALUATION.moduleResponses, suggestion: { responseCode: 'very_helpful', missingReason: null },
    } });
    assert.equal(normalizeModuleResponses(complete, ['color', 'suggestion'], true).suggestion?.responseCode,
      'very_helpful');
    assert.throws(() => normalizeModuleResponses(input, []), /MODULE_NOT_SHOWN/);
  });
  it('does not expose a report before intention and AI consent', () => {
    const p = new ParticipantModel({ postAssessment: { status: 'submitted' } });
    assert.throws(() => assertCanViewReport(p), /CONSENT_REQUIRED/);
    p.allowPrivateAi = true;
    assert.throws(() => assertCanViewReport(p), /INTENTION_REQUIRED/);
  });
  it('reports empty data as missing and a nondegenerate Wilson interval for unanimous agreement', () => {
    assert.equal(describeFeedback([]).median, null);
    const result = describeFeedback([7, 7, 7]);
    assert.equal(result.agreementProportion, 1);
    assert.ok(result.agreementCiLow !== null && result.agreementCiLow < 1);
    assert.equal(result.median, 7);
  });
});

describe('classroom reflection HTTP gates and persistence', () => {
  let server: Server;
  let base: string;
  let stored: IClassroomParticipation;
  let classroom: { classId: string; status: string; writeLock?: string };
  let reportExists: boolean;
  function query<T>(value: () => T) {
    const chain = { exec: async () => value(), lean: () => chain, select: () => chain };
    return chain;
  }
  function participantDocument() {
    const doc = new ParticipantModel(stored);
    sinon.stub(doc, 'save').callsFake(async () => { stored = doc.toObject(); return doc; });
    return doc;
  }
  beforeEach(async () => {
    classroom = { classId: 'class-test', status: 'open' };
    stored = new ParticipantModel({ participantId: randomUUID(), classId: classroom.classId,
      classroomCode: 'ABCD', resumeTokenHash: hashToken(TOKEN), currentStage: 'ai_echo',
      preAssessment: { status: 'submitted', answeredCount: 13 },
      postAssessment: { status: 'submitted', answeredCount: 13 },
      allowPrivateAi: true, allowSensitiveText: false, artworkId: 'work-test', lastActiveAt: new Date(),
    }).toObject();
    reportExists = true;
    const classroomModel = {
      findOne: () => query(() => ({ ...classroom })),
      updateOne: (filter: Record<string, unknown>, update: { $set?: { writeLock?: string }; $unset?: unknown }) =>
        query(() => {
          if (filter.writeLock && typeof filter.writeLock === 'object' && classroom.writeLock) {
            return { modifiedCount: 0 };
          }
          if (typeof filter.writeLock === 'string' && filter.writeLock !== classroom.writeLock) {
            return { modifiedCount: 0 };
          }
          if (update.$set) Object.assign(classroom, update.$set);
          if (update.$unset) delete classroom.writeLock;
          return { modifiedCount: 1 };
        }),
    };
    sinon.stub(db, 'getClassroomModel').returns(classroomModel as unknown as ReturnType<typeof db.getClassroomModel>);
    const participantModel = { findOne: () => query(participantDocument),
      updateMany: () => query(() => ({ modifiedCount: 0 })) };
    sinon.stub(db, 'getClassroomParticipationModel')
      .returns(participantModel as unknown as ReturnType<typeof db.getClassroomParticipationModel>);
    const workModel = { findOne: () => query(() => ({ workId: 'work-test', participantId: stored.participantId,
      contentHash: 'image-hash', images: [], healing: { status: 'success', cozeRunId: RUN_ID } })),
      updateMany: () => query(() => ({ modifiedCount: 0 })) };
    sinon.stub(db, 'getWorkModel').returns(workModel as unknown as ReturnType<typeof db.getWorkModel>);
    const analysisModel = { findOne: () => query(() => reportExists ? {
      analysisId: RUN_ID, reportJson: JSON.stringify({ summary: 'Private AI report' }), shownModules: ['color'],
    } : null), updateMany: () => query(() => ({ modifiedCount: 0 })) };
    sinon.stub(db, 'getClassroomArtworkAnalysisModel')
      .returns(analysisModel as unknown as ReturnType<typeof db.getClassroomArtworkAnalysisModel>);
    const app = express(); app.use(express.json()); app.use(router);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    base = `http://127.0.0.1:${address.port}`;
  });
  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    sinon.restore();
  });
  async function request(path: string, body?: unknown, key = randomUUID()) {
    const result = await fetch(`${base}${path}`, { method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Participation-Token': TOKEN, 'Idempotency-Key': key },
      body: body ? JSON.stringify(body) : undefined });
    return { status: result.status, body: await result.json() as { data?: Record<string, unknown> } };
  }
  it('blocks direct echo requests, preserves first intent and idempotency, binds evaluation to exposure', async () => {
    assert.equal((await request('/echo')).status, 409);
    const key = randomUUID();
    assert.equal((await request('/intention/submit', INTENTION, key)).status, 200);
    assert.equal((await request('/intention/submit', INTENTION, key)).status, 200);
    assert.equal(stored.intention?.revision, 1);
    assert.equal((await request('/intention/submit', { ...INTENTION, expressionConfidence: 7 }, key)).status, 409);
    assert.equal((await request('/feedback', EVALUATION)).status, 409);
    assert.equal((await request('/echo')).body.data?.summary, 'Private AI report');
    assert.ok(stored.reportReturnedAt);
    await request('/echo/viewed', { analysisRunId: RUN_ID });
    assert.equal((await request('/feedback', { ...EVALUATION, moduleResponses: {} })).status, 409);
    assert.equal((await request('/feedback', EVALUATION)).status, 200);
    assert.equal(stored.researchRecordComplete, true);
    await request('/intention/submit', { ...INTENTION, expressionConfidence: 5 });
    assert.equal(stored.intentionHistory[0].expressionConfidence, 6);
    assert.equal(stored.intention?.postExposureRevision, true);
    await request('/intention/submit', INTENTION, key);
    assert.equal(stored.intention?.revision, 2);
    assert.equal(stored.intention?.expressionConfidence, 5);
    assert.equal(reflectionWideRow(stored).intentionText, null);
    assert.equal(reflectionWideRow(stored, true).overallComment, null);
  });
  it('closed incomplete participants can read state but cannot write or bypass exposure gate', async () => {
    classroom.status = 'closed';
    const before = stored.lastActiveAt.getTime();
    assert.equal((await request('/state')).body.data?.readOnly, true);
    assert.equal((await request('/intention/submit', INTENTION)).status, 409);
    assert.equal((await request('/complete', {})).status, 409);
    assert.equal((await request('/echo')).status, 409);
    assert.equal(stored.lastActiveAt.getTime(), before);
  });
  it('blocks gallery sharing and both review stages after sealing without creating tasks', async () => {
    stored.consentedAt = new Date();
    classroom.status = 'closed';
    const before = JSON.stringify(stored);
    const create = sinon.spy();
    sinon.stub(db, 'getPeerReviewModel').returns({ create } as unknown as ReturnType<typeof db.getPeerReviewModel>);
    for (const path of ['/gallery/sharing', '/gallery/work/independent', '/gallery/work/feedback']) {
      assert.equal((await request(path, { sharing: true })).status, 409);
    }
    assert.equal(create.callCount, 0);
    assert.equal(JSON.stringify(stored), before);
  });
  it('rejects malformed gallery answers before creating or consenting to a task', async () => {
    stored.consentedAt = new Date();
    const create = sinon.spy();
    sinon.stub(db, 'getPeerReviewModel').returns({ create } as unknown as ReturnType<typeof db.getPeerReviewModel>);
    assert.equal((await request('/gallery/work/independent', {
      submit: true, consent: true, answers: { emotions: ['calm'] },
    })).status, 400);
    assert.equal(create.callCount, 0);
    assert.equal(stored.peerConsentAt, undefined);
  });
  it('returns an authorised report after sealing without adding exposure events', async () => {
    await request('/intention/submit', INTENTION);
    classroom.status = 'closed';
    const before = JSON.stringify(stored);
    assert.equal((await request('/echo')).body.data?.summary, 'Private AI report');
    assert.equal(stored.reportReturnedAt, undefined);
    assert.equal((await request('/echo/viewed', { analysisRunId: RUN_ID })).status, 409);
    assert.equal(JSON.stringify(stored), before);
  });
  it('records one unified consent action as versioned AI and research grants', async () => {
    stored.artworkId = undefined;
    const input = { consentVersion: 'classroom-consent-v4-2026-09-13',
      allowPrivateAi: true, allowSensitiveText: true };
    assert.equal((await request('/consent', { ...input, allowSensitiveText: false })).status, 400);
    const key = randomUUID();
    assert.equal((await request('/consent', input, key)).status, 200);
    assert.equal((await request('/consent', input, key)).status, 200);
    assert.equal(stored.consentVersion, input.consentVersion);
    assert.equal(stored.allowPrivateAi, true);
    assert.equal(stored.allowSensitiveText, true);
    assert.equal(stored.consentEvents.length, 2);
    assert.ok(stored.consentEvents.every((event) => event.granted && event.consentTextVersion === input.consentVersion));
  });
  it('accepts intention without an artwork and keeps the research record incomplete', async () => {
    stored.artworkId = undefined;
    assert.equal((await request('/intention/submit', INTENTION)).status, 200);
    assert.equal(stored.intention?.workId, undefined);
    assert.equal(stored.researchRecordComplete, false);
  });
  it('rejects stale or missing report snapshots', async () => {
    await request('/intention/submit', INTENTION);
    reportExists = false;
    assert.equal((await request('/echo')).status, 409);
  });
  it('finalization waits for an active write and rejects subsequent writes', async () => {
    classroom.status = 'closing';
    let release: () => void = () => undefined;
    let entered: () => void = () => undefined;
    const entry = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const writer = withClassroomWrite(classroom.classId, async () => { entered(); await gate; });
    await entry;
    const sealing = finalizeClassroom(classroom.classId, 'teacher');
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(classroom.status, 'closing');
    release();
    await Promise.all([writer, sealing]);
    assert.equal(classroom.status, 'closed');
    await assert.rejects(withClassroomWrite(classroom.classId, () => assertClassroomWritable(classroom.classId)),
      /CLASSROOM_READ_ONLY/);
  });
  it('serializes competing writers, releases on failure, and rejects sealed writes', async () => {
    await withClassroomWrite(classroom.classId, async () => {
      await assertClassroomWritable(classroom.classId);
      await withClassroomWrite(classroom.classId, async () => assert.ok(classroom.writeLock));
    });
    assert.equal(classroom.writeLock, undefined);
    await assert.rejects(withClassroomWrite(classroom.classId, async () => { throw new Error('test'); }), /test/);
    assert.equal(classroom.writeLock, undefined);
    classroom.status = 'closed';
    await assert.rejects(withClassroomWrite(classroom.classId, () => assertClassroomWritable(classroom.classId)),
      /CLASSROOM_READ_ONLY/);
  });
});
