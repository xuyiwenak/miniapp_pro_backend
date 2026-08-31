import { strict as assert } from 'assert';
import sharp from 'sharp';
import { normalizeClassroomImage } from '../../src/apps/mandis/miniapp/services/classroomArtwork';

function dataUrl(buffer: Buffer, contentType = 'image/jpeg'): string {
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

describe('classroom artwork normalization', () => {
  it('applies EXIF orientation and removes metadata before storage', async () => {
    const source = await sharp({
      create: {
        width: 160,
        height: 120,
        channels: 3,
        background: '#3a8f88',
      },
    }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const normalized = await normalizeClassroomImage(dataUrl(source));
    const metadata = await sharp(normalized.buffer).metadata();
    assert.equal(normalized.width, 120);
    assert.equal(normalized.height, 160);
    assert.equal(metadata.orientation, undefined);
    assert.equal(metadata.exif, undefined);
  });

  it('rejects decoded images below the minimum dimension', async () => {
    const source = await sharp({
      create: {
        width: 80,
        height: 120,
        channels: 3,
        background: '#ffffff',
      },
    }).jpeg().toBuffer();
    await assert.rejects(
      normalizeClassroomImage(dataUrl(source)),
      /INVALID_IMAGE_DIMENSIONS/,
    );
  });
});
