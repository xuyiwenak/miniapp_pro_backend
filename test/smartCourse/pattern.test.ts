import assert from 'assert';
import sharp from 'sharp';
import { newPatternState, sealText, type PatternState } from '../../src/apps/smartCourse/pattern/contract';
import { PatternSchema } from '../../src/apps/smartCourse/pattern/validation';
import { PLATE, RING_BOUNDS, orbitItems } from '../../src/apps/smartCourse/pattern/geometry';
import { colorize } from '../../src/apps/smartCourse/pattern/color';
import { normalizePatternImage } from '../../src/apps/smartCourse/pattern/images';
import { renderPattern } from '../../src/apps/smartCourse/pattern/renderer';
import { sealSvg } from '../../src/apps/smartCourse/pattern/seal';
import { PRESETS } from '../../src/apps/smartCourse/pattern/presets';

describe('smartCourse deterministic pattern composition', function () {
  this.timeout(30_000);
  it('expands 2/3/4 Han characters and rejects malformed signatures', () => {
    assert.equal(sealText('黎明'), '黎明之印'); assert.equal(sealText('王小明'), '王小明印');
    assert.equal(sealText('徐杨谷雨'), '徐杨谷雨');
    for (const name of ['', '黎', '一二三四五', '黎 明', 'AB', '<>', '黎明🙂']) assert.equal(sealText(name), '');
    const svg = sealSvg('黎明'); assert.equal((svg.match(/<path /g) || []).length, 4);
    assert(!svg.includes('<text')); assert.throws(() => sealSvg('一'), /2～4/);
  });
  it('locks template, crop bounds, repeat counts, and seals at the input boundary', () => {
    const state = newPatternState(); assert(PatternSchema.safeParse(state).success);
    assert(!PatternSchema.safeParse({ ...state, crop: { ...state.crop, zoom: Infinity } }).success);
    assert(!PatternSchema.safeParse({ ...state, rings: [{ ...state.rings[0], count: 11 }, state.rings[1]] }).success);
    assert(!PatternSchema.safeParse({ ...state, radius: 999 }).success);
    assert(!PatternSchema.safeParse({ ...state, seal: { enabled: true, name: 'x' } }).success);
    assert(!PatternSchema.safeParse({ ...state, rings: [{ ...state.rings[0], assetId: 'https://evil/' }, state.rings[1]] }).success);
  });
  it('keeps long and square motifs inside rings with no overlap under every rule and direction', () => {
    for (const bounds of [...RING_BOUNDS.single, ...RING_BOUNDS.double]) {
      for (const [width, height] of [[100, 100], [1000, 10], [10, 1000]]) {
        for (const count of [8, 12, 16]) {
          const items = orbitItems(bounds, { ...newPatternState().rings[0], count }, width, height);
          assert.equal(items.length, count);
          for (const [i, item] of items.entries()) {
            assert(Math.abs(item.width / item.height - width / height) < 0.00001);
            const radius = Math.hypot(item.width, item.height) / 2;
            const r = Math.hypot(item.x - PLATE.center, item.y - PLATE.center);
            assert(r - radius >= bounds[0] * PLATE.radius);
            assert(r + radius <= bounds[1] * PLATE.radius);
            const next = items[(i + 1) % count];
            assert(Math.hypot(next.x - item.x, next.y - item.y) > radius * 2);
          }
        }
      }
    }
    const bounds = RING_BOUNDS.single[0]; const ring = newPatternState().rings[0];
    assert.equal(orbitItems(bounds, ring, 100, 100)[0].rotation, 0);
    assert.equal(orbitItems(bounds, { ...ring, orientation: 'inward' }, 100, 100)[0].rotation, -180);
    assert.equal(orbitItems(bounds, { ...ring, orientation: 'tangent' }, 100, 100)[0].rotation, 90);
    assert.equal(orbitItems(bounds, { ...ring, rule: 'mirror' }, 100, 100)[1].flip, -1);
    assert.equal(orbitItems(bounds, { ...ring, rule: 'rotate' }, 100, 100)[1].rotation, 210);
  });
  it('preserves alpha and keeps white-paper removal independent of the blue palette', () => {
    const state = newPatternState();
    const pixels = new Uint8Array([255, 255, 255, 255, 0, 0, 0, 128, 255, 0, 0, 0]);
    const result = colorize(pixels, state);
    assert.equal(result[3], 0); assert.equal(result[7], 128); assert.equal(result[11], 0);
    assert.deepEqual([...result.slice(4, 7)], [27, 58, 107]);
    const white = colorize(new Uint8Array([255, 255, 255, 128]), { ...state, removeWhite: false });
    assert.deepEqual([...white], [255, 255, 255, 128]);
  });
  it('normalizes to transparent PNG and rejects non-image content', async () => {
    const original = await sharp({ create: { width: 20, height: 10, channels: 4, background: '#00000000' } }).png().toBuffer();
    const normalized = await normalizePatternImage(original);
    assert.equal(normalized.info.format, 'png'); assert.equal(normalized.info.channels, 4);
    await assert.rejects(normalizePatternImage(Buffer.from('<script>bad</script>')), /JPG/);
  });
  it('renders all shipped presets on both templates and preserves the mandatory blank annulus', async () => {
    const raw = await sharp(Buffer.from('<svg width="200" height="200"><circle cx="100" cy="100" r="90" fill="black"/></svg>')).png().toBuffer();
    const assets = new Map([['source', raw]]);
    for (const template of ['single', 'double'] as const) {
      for (const preset of PRESETS) {
        const state = newPatternState(); state.centerAssetId = 'source'; state.template = template;
        state.rings.forEach(ring => { ring.presetId = preset.id; });
        const { png } = await renderPattern(state, assets, 500);
        const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        // Radius 0.45R is strictly inside the protected blank band; upper point avoids stamp exception.
        const x = 250; const y = Math.round(250 - 0.45 * 235); const offset = (y * 500 + x) * 4;
        assert.deepEqual([...data.slice(offset, offset + 4)], [255, 255, 255, 255]);
      }
    }
  });
  it('exports repeatable 2048 PNG with red stamp unchanged by blue recoloring', async () => {
    const state = newPatternState(); state.seal = { enabled: true, name: '王小明' };
    const first = await renderPattern(state, new Map(), 2048);
    const second = await renderPattern(state, new Map(), 2048);
    assert(first.png.equals(second.png));
    const { data, info } = await sharp(first.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 2048); assert.equal(info.height, 2048);
    let red = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] > 150 && data[i + 1] < 100 && data[i + 2] < 100) red++;
    assert(red > 100);
  });
  it('rejects empty white motifs and invisible crop positions', async () => {
    const white = await sharp({ create: { width: 30, height: 30, channels: 3, background: 'white' } }).png().toBuffer();
    const state: PatternState = { ...newPatternState(), centerAssetId: 'source' };
    await assert.rejects(renderPattern(state, new Map([['source', white]])), /没有找到可见纹样/);
  });
});
