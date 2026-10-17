import assert from 'assert';
import { buildAgentBody, buildContext, createBailianAgent, parseAgentAnswer } from '../../src/apps/smartCourse/services/bailian';
import { loadConfig, configuredCapabilities } from '../../src/apps/smartCourse/config';
import type { Course, Turn } from '../../src/apps/smartCourse/dbservice/models';
import { normalizeArtwork } from '../../src/apps/smartCourse/services/storage';
import sharp from 'sharp';

describe('smartCourse agent boundary', () => {
  const input = { question: '怎么开始？', mode: 'create' as const, artworkUrl: '', studentStatement: '', contextText: '' };
  it('uses application input.biz_params without provider sessions or client-supplied prompts', () => {
    assert.deepStrictEqual(buildAgentBody(input), { input: { prompt: input.question, biz_params: {
      mode: 'create', artworkUrl: '', studentStatement: '', contextText: '',
    } }, parameters: {} });
  });
  it('returns only final text, excluding reasoning and traces', () => {
    assert.deepStrictEqual(parseAgentAnswer({ output: { text: '试着画一个单元', reasoningContent: 'hidden' },
      request_id: 'provider-1', thoughts: ['private'] }), { answer: '试着画一个单元', providerRequestId: 'provider-1' });
    assert.throws(() => parseAgentAnswer({ output: { text: '' } }));
  });
  it('excludes old artwork and failed turns from no-image context', () => {
    const turns = [
      { status: 'success', question: '图一', answer: '图一内容', artworkId: 'a' },
      { status: 'success', question: '一般问题', answer: '一般回答' },
      { status: 'failed', question: '错误', answer: '错误' },
    ] as Turn[];
    assert.strictEqual(buildContext(turns), '学生：一般问题\n助教：一般回答');
    assert.strictEqual(buildContext(turns, 'a'), '学生：图一\n助教：图一内容');
    assert.strictEqual(buildContext(turns, 'b'), '');
  });
  it('does not call upstream without credentials', async () => {
    let calls = 0;
    const agent = createBailianAgent(loadConfig({}), async () => { calls++; throw new Error(); });
    await assert.rejects(agent({ appId: 'app' } as Course, input), /尚未配置/);
    assert.strictEqual(calls, 0);
  });
  it('does not leak upstream errors or retry a failed provider call', async () => {
    let calls = 0;
    const agent = createBailianAgent(loadConfig({ SMARTCOURSE_BAILIAN_API_KEY: 'test-only' }), async () => {
      calls++; return new Response('private upstream trace', { status: 500 });
    });
    await assert.rejects(agent({ appId: 'app' } as Course, input), /暂时不可用/);
    assert.strictEqual(calls, 1);
  });
  it('re-encodes images and rejects non-image bytes', async () => {
    const image = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#ffffff' } })
      .png().withMetadata().toBuffer();
    const normalized = await normalizeArtwork(image);
    const metadata = await sharp(normalized).metadata();
    assert.strictEqual(metadata.format, 'jpeg'); assert.strictEqual(metadata.exif, undefined);
    await assert.rejects(normalizeArtwork(Buffer.from('not an image')), /图片无法读取/);
  });
});

describe('smartCourse connectivity-only configuration', () => {
  it('reports disabled integrations without preventing basic configuration', () => {
    const config = loadConfig({ SMARTCOURSE_BAILIAN_APP_ID: 'test-app' });
    assert.deepStrictEqual(configuredCapabilities(config), { agentReady: false, uploadReady: false });
  });
});
