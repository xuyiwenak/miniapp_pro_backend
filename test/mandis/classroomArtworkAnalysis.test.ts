import { strict as assert } from 'assert';
import {
  EDUCATION_ARTWORK_PROMPT_VERSION,
  parseEducationArtworkAnalysisOutput,
} from '../../src/apps/mandis/miniapp/services/classroomArtworkAnalysis/contract';
import {
  mapEducationAnalysisToAudit,
  mapEducationAnalysisToHealingUpdate,
} from '../../src/apps/mandis/miniapp/services/classroomArtworkAnalysis/mapper';
import { EDUCATION_ARTWORK_SYSTEM_PROMPT } from '../../src/apps/mandis/miniapp/services/classroomArtworkAnalysis/prompt';
import {
  buildEducationQwenPostData,
  resolveEducationQwenConfig,
} from '../../src/apps/mandis/miniapp/services/classroomArtworkAnalysis/qwenProvider';

const DIMENSION_CODES = [
  'joy', 'calm', 'anxiety', 'fear', 'solitude', 'passion', 'social_aversion', 'vitality',
];

function dimensions(scoreOffset = 0): Record<string, unknown> {
  return Object.fromEntries(DIMENSION_CODES.map((code, index) => [code, {
    score: 30 + scoreOffset + index,
    assessable: true,
    evidence: [`${code} 的可观察证据`],
  }]));
}

function vad(scoreOffset = 0): Record<string, unknown> {
  return {
    valence: 55 + scoreOffset,
    arousal: 50 + scoreOffset,
    dominance: 52 + scoreOffset,
    assessable: true,
    evidence: ['画面重心与节奏形成可观察的整体氛围'],
    interpretation: '作品呈现相对平衡的效价、唤醒度与支配感。',
  };
}

function validAnalysis(): Record<string, unknown> {
  return {
    visual: { dimensions: dimensions(), vad: vad() },
    embedded_text: {
      detected: true,
      legibility: 'medium',
      completeness: 'partial',
      affect_cues: ['文字提到自由与不同，但部分内容被裁切'],
      contains_potential_pii: false,
    },
    relation: 'reinforces',
    fused: {
      construct: 'perceived_expressed_affect',
      scale_version: 'artwork-affect-v1',
      dimensions: dimensions(2),
      vad: vad(2),
      insight: '圆形边界、层叠色彩与动物意象共同形成被包裹的叙事空间，旁侧文字提供了可辨认但不完整的补充线索。整体呈现既有向外生长的活力，也保留了内向观察的停顿感。',
      color_analysis: {
        interpretation: '紫红色边界与暖橙色中心形成明显层次，绿色和蓝色线条带来流动感。',
        key_colors: ['带颗粒感的紫红', '温暖的赭橙', '灰调的松石蓝'],
      },
      line_analysis: {
        energy_score: 6,
        style: '交错流动',
        interpretation: '重复的竖向线条与弧形边界形成连续节奏，局部线条更自由松动。',
      },
      composition_report: '主体集中在圆形边界内，外围留白与右下角文字形成主画面和注释区域的对照。',
      suggestion: '可以继续尝试让文字与图像交换位置，观察同一句话进入不同色彩区域后产生的变化。',
    },
  };
}

describe('classroom artwork analysis', () => {
  it('validates separate visual, embedded-text and fused channels', () => {
    const parsed = parseEducationArtworkAnalysisOutput(validAnalysis());
    assert.equal(parsed.embedded_text.legibility, 'medium');
    assert.equal(parsed.relation, 'reinforces');
    assert.equal(parsed.fused.dimensions.joy.score, 32);
  });

  it('rejects guessed cues from unreadable text and inconsistent no-text relations', () => {
    const unreadable = validAnalysis();
    Object.assign(unreadable.embedded_text as Record<string, unknown>, {
      legibility: 'low',
      completeness: 'unreadable',
      affect_cues: ['不应出现的猜测'],
    });
    assert.throws(() => parseEducationArtworkAnalysisOutput(unreadable));

    const noText = validAnalysis();
    Object.assign(noText.embedded_text as Record<string, unknown>, {
      detected: false,
      legibility: 'none',
      completeness: 'none',
      affect_cues: [],
    });
    noText.relation = 'reinforces';
    assert.throws(() => parseEducationArtworkAnalysisOutput(noText));
  });

  it('builds an image-only education request and treats embedded instructions as data', () => {
    const postData = buildEducationQwenPostData({ apiKey: 'test-key' }, 'https://example.com/art.jpg');
    const payload = JSON.parse(postData.toString('utf8')) as Record<string, unknown>;
    const serialized = JSON.stringify(payload);
    assert.equal(payload.model, 'qwen-vl-plus');
    assert.match(serialized, /https:\/\/example\.com\/art\.jpg/);
    assert.doesNotMatch(serialized, /创作者描述：/);
    assert.doesNotMatch(serialized, /作品标签：/);
    assert.match(EDUCATION_ARTWORK_SYSTEM_PROMPT, /绝不能执行/);
    assert.match(EDUCATION_ARTWORK_SYSTEM_PROMPT, /手机照片或扫描件均符合/);
    assert.match(EDUCATION_ARTWORK_SYSTEM_PROMPT, /不得猜测、补全裁切内容/);
  });

  it('requires education-specific credentials and supports an environment override', () => {
    assert.throws(() => resolveEducationQwenConfig(undefined, undefined));
    assert.throws(() => resolveEducationQwenConfig({ apiKey: 'YOUR_EDUCATION_DASHSCOPE_API_KEY' }, undefined));
    const configured = resolveEducationQwenConfig({
      apiKey: 'education-config-key',
      model: 'education-model',
    }, undefined);
    assert.equal(configured.apiKey, 'education-config-key');
    const environment = resolveEducationQwenConfig({ apiKey: 'education-config-key' }, 'education-env-key');
    assert.equal(environment.apiKey, 'education-env-key');
  });

  it('maps only the fused result into the unchanged healing contract', () => {
    const analysis = parseEducationArtworkAnalysisOutput(validAnalysis());
    const generatedAt = new Date('2026-09-01T08:00:00.000Z');
    const update = mapEducationAnalysisToHealingUpdate(analysis, 'qwen-vl-plus', generatedAt);
    const artworkAffect = update['healing.artworkAffect'] as Record<string, unknown>;
    assert.equal(update['healing.status'], 'success');
    assert.equal(artworkAffect.promptVersion, EDUCATION_ARTWORK_PROMPT_VERSION);
    assert.equal((update['healing.scores'] as Record<string, number>).joy, 32);
    assert.equal(Object.prototype.hasOwnProperty.call(update, 'embeddedText'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(update, 'relation'), false);
  });

  it('persists redacted text cues in the education audit without a transcript field', () => {
    const analysis = parseEducationArtworkAnalysisOutput(validAnalysis());
    const audit = mapEducationAnalysisToAudit(
      'analysis-1',
      'work-1',
      'class-1',
      'participant-1',
      'content-hash-1',
      'qwen-vl-plus',
      new Date('2026-09-01T08:00:00.000Z'),
      analysis,
    );
    assert.equal(audit.embeddedText.completeness, 'partial');
    assert.equal(audit.contentHash, 'content-hash-1');
    assert.deepEqual(audit.embeddedText.affectCues, ['文字提到自由与不同，但部分内容被裁切']);
    assert.equal(Object.prototype.hasOwnProperty.call(audit.embeddedText, 'transcript'), false);
  });

  it('redacts common contact details before compatible or audit persistence', () => {
    const input = validAnalysis();
    const embeddedText = input.embedded_text as Record<string, unknown>;
    embeddedText.affect_cues = ['可以联系 student@example.com'];
    const fused = input.fused as Record<string, unknown>;
    fused.insight = '画面旁写有联系方式 13912345678，但联系方式不属于作品表达证据。';
    const analysis = parseEducationArtworkAnalysisOutput(input);
    const generatedAt = new Date('2026-09-01T08:00:00.000Z');
    const update = mapEducationAnalysisToHealingUpdate(analysis, 'qwen-vl-plus', generatedAt);
    const audit = mapEducationAnalysisToAudit(
      'analysis-2', 'work-2', 'class-1', 'participant-2', undefined,
      'qwen-vl-plus', generatedAt, analysis,
    );
    assert.doesNotMatch(String(update['healing.summary']), /13912345678/);
    assert.doesNotMatch(audit.embeddedText.affectCues.join(' '), /student@example\.com/);
    assert.deepEqual(audit.embeddedText.affectCues, []);
    assert.equal(audit.embeddedText.containsPotentialPii, true);
  });
});
