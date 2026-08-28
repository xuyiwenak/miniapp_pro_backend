import { strict as assert } from 'assert';
import type { IWork } from '../../src/entity/work.entity';
import { buildHealingReportResponse } from '../../src/apps/mandis/miniapp/routes/healing';

const OWNER_ID = 'report-owner';
const VIEWER_ID = 'different-viewer';
const WORK_ID = 'report-work';
const COVER_URL = 'https://example.com/artwork.png';

function createWork(): IWork {
  const createdAt = new Date('2026-08-28T05:00:00.000Z');
  const analyzedAt = new Date('2026-08-28T05:00:07.000Z');
  return {
    workId: WORK_ID,
    authorId: OWNER_ID,
    desc: '一幅彩色铅笔画',
    images: [{ url: COVER_URL, name: 'artwork.png', type: 'image/png' }],
    tags: [],
    status: 'published',
    createdAt,
    updatedAt: analyzedAt,
    healing: {
      scores: { joy: 87, calm: 62 },
      summary: '温和的整体观察',
      colorAnalysis: '色彩观察',
      compositionReport: '空间观察',
      lineAnalysis: { interpretation: '线条观察', style: '流动' },
      suggestion: '创作建议',
      keyColors: ['#4DBFB4'],
      status: 'success',
      isPublic: false,
      analyzedAt,
    },
  };
}

describe('healing report response', () => {
  it('adds the web report contract while preserving legacy miniapp fields', () => {
    const response = buildHealingReportResponse(createWork(), OWNER_ID);

    assert.equal(response.workId, WORK_ID);
    assert.equal(response.coverUrl, COVER_URL);
    assert.equal(response.desc, '一幅彩色铅笔画');
    assert.equal(response.summary, '温和的整体观察');
    assert.equal(response.colorAnalysis, '色彩观察');
    assert.equal(response.compositionReport, '空间观察');
    assert.deepEqual(response.lineAnalysis, { interpretation: '线条观察', style: '流动' });
    assert.equal(response.isPublic, false);
    assert.equal(response.dominantEmotionLabel, '快乐');
    assert.equal(response.healingSummary, response.summary);
    assert.equal(response.healingColorAnalysis, response.colorAnalysis);
    assert.equal(response.healingIsPublic, response.isPublic);
  });

  it('does not expose private report content to a non-owner', () => {
    const response = buildHealingReportResponse(createWork(), VIEWER_ID);

    assert.equal(response.healingVisible, false);
    assert.equal(response.healingIsPublic, false);
    assert.equal('summary' in response, false);
    assert.equal('coverUrl' in response, false);
  });
});
