import assert from 'assert';
import { loadConfig } from '../../src/apps/smartCourse/config';
import { createCeramicProvider } from '../../src/apps/smartCourse/services/ceramicProvider';
describe('ceramic image provider', () => {
  const config = loadConfig({ SMARTCOURSE_BAILIAN_API_KEY: 'test-key' });
  it('submits exactly one standard 1K image through the asynchronous API', async () => {
    let count = 0;
    const transport: typeof fetch = async (input, init) => {
      count++;
      assert(String(input).endsWith('/services/aigc/image-generation/generation'));
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, 'qwen-image-3.0');
      assert.deepEqual(body.parameters, { size: '1024*1024', n: 1, prompt_extend: false, watermark: false });
      assert.equal(body.input.messages[0].content[0].image, 'https://example.com/accurate.png');
      assert.equal(new Headers(init?.headers).get('X-DashScope-Async'), 'enable');
      return Response.json({ output: { task_id: 'abc', task_status: 'PENDING' } });
    };
    assert.equal(await createCeramicProvider(config, transport).submit('https://example.com/accurate.png'), 'abc');
    assert.equal(count, 1);
  });
  it('queries a task without submitting and extracts its image', async () => {
    const transport: typeof fetch = async (input, init) => {
      assert(String(input).endsWith('/tasks/abc')); assert.equal(init?.method, 'GET');
      return Response.json({ output: { task_id: 'abc', task_status: 'SUCCEEDED', choices: [{ message: {
        content: [{ image: 'https://result.oss-cn-beijing.aliyuncs.com/a.png' }],
      } }] } });
    };
    const result = await createCeramicProvider(config, transport).query('abc');
    assert.equal(result.status, 'success'); assert(result.imageUrl?.endsWith('/a.png'));
  });
  it('does not download untrusted or redirected output locations', async () => {
    let called = false;
    const provider = createCeramicProvider(config, async () => { called = true; throw new Error('unexpected'); });
    await assert.rejects(() => provider.download('http://127.0.0.1/private'));
    await assert.rejects(() => provider.download('https://aliyuncs.com.attacker.test/a.png'));
    assert.equal(called, false);
  });
  it('distinguishes explicit rejection from an ambiguous upstream failure', async () => {
    for (const status of [400, 500]) {
      const provider = createCeramicProvider(config, async () => new Response('', { status }));
      await assert.rejects(() => provider.submit('https://example.com/a.png'),
        { code: status === 400 ? 'IMAGE_REJECTED' : 'IMAGE_UNCERTAIN' });
    }
  });
});
