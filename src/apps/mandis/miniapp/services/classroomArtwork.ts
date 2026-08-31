import { createHash, randomUUID } from 'crypto';
import sharp from 'sharp';
import { getWorkModel } from '../../../../dbservice/model/GlobalInfoDBModel';
import { checkImage } from '../../../../util/wxContentSecurity';
import { uploadToStorage } from '../../../../util/imageUploader';
import { getOssUploadPrefixes } from '../../../../util/ossUploader';

const MAX_ARTWORK_BYTES = 10 * 1024 * 1024;
const MIN_ARTWORK_DIMENSION = 100;
const MAX_ARTWORK_DIMENSION = 12_000;
const MAX_ARTWORK_PIXELS = 40_000_000;
const DATA_URL_PATTERN = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/;
const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export type ClassroomArtworkInput = {
  classId: string;
  participantId: string;
  dataUrl: string;
  uploaderRole: 'student' | 'teacher';
  uploadReason?: string;
};

export type ClassroomArtworkReplacement = {
  artworkId: string;
  previousImageUrl?: string;
  replacementImageUrl: string;
  previousContentHash?: string;
  replacementContentHash: string;
};

export type NormalizedClassroomImage = {
  buffer: Buffer;
  contentType: string;
  width: number;
  height: number;
};

type StoredImage = NormalizedClassroomImage & {
  contentHash: string;
  url: string;
  filename: string;
};

function decodeDataUrl(dataUrl: string): { buffer: Buffer; contentType: string } {
  const match = DATA_URL_PATTERN.exec(dataUrl);
  if (!match) throw new Error('INVALID_IMAGE_FORMAT');
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0 || buffer.length > MAX_ARTWORK_BYTES) {
    throw new Error('INVALID_IMAGE_SIZE');
  }
  return { buffer, contentType: match[1] };
}

function validateDimensions(width: number, height: number): void {
  const dimensionInvalid = width < MIN_ARTWORK_DIMENSION
    || height < MIN_ARTWORK_DIMENSION
    || width > MAX_ARTWORK_DIMENSION
    || height > MAX_ARTWORK_DIMENSION;
  if (dimensionInvalid || width * height > MAX_ARTWORK_PIXELS) {
    throw new Error('INVALID_IMAGE_DIMENSIONS');
  }
}

export async function normalizeClassroomImage(
  dataUrl: string
): Promise<NormalizedClassroomImage> {
  const decoded = decodeDataUrl(dataUrl);
  const pipeline = sharp(decoded.buffer, { failOn: 'error' }).rotate();
  if (decoded.contentType === 'image/jpeg') pipeline.jpeg({ quality: 92 });
  if (decoded.contentType === 'image/png') pipeline.png();
  if (decoded.contentType === 'image/webp') pipeline.webp({ quality: 92 });
  const normalized = await pipeline.toBuffer({ resolveWithObject: true });
  validateDimensions(normalized.info.width, normalized.info.height);
  if (normalized.data.length > MAX_ARTWORK_BYTES) throw new Error('INVALID_IMAGE_SIZE');
  return {
    buffer: normalized.data,
    contentType: decoded.contentType,
    width: normalized.info.width,
    height: normalized.info.height,
  };
}

async function ensureUniqueArtwork(
  classId: string,
  contentHash: string,
  excludedWorkId?: string
): Promise<void> {
  const Work = getWorkModel();
  const query: Record<string, unknown> = { classroomId: classId, contentHash };
  if (excludedWorkId) query.workId = { $ne: excludedWorkId };
  if (await Work.exists(query).exec()) throw new Error('DUPLICATE_ARTWORK');
}

async function storeImage(
  input: ClassroomArtworkInput,
  workId: string,
  excludedWorkId?: string
): Promise<StoredImage> {
  const image = await normalizeClassroomImage(input.dataUrl);
  const security = await checkImage(image.buffer, image.contentType);
  if (!security.safe) throw new Error('UNSAFE_IMAGE');
  const contentHash = createHash('sha256').update(image.buffer).digest('hex');
  await ensureUniqueArtwork(input.classId, contentHash, excludedWorkId);
  const extension = EXTENSION_BY_TYPE[image.contentType];
  const filename = `${workId}.${extension}`;
  const { worksObjectPrefix } = getOssUploadPrefixes();
  const key = `${worksObjectPrefix}/classrooms/${input.classId}/${filename}`;
  const url = await uploadToStorage(image.buffer, key, image.contentType);
  return { ...image, contentHash, url, filename };
}

export async function createClassroomArtwork(
  input: ClassroomArtworkInput
): Promise<string> {
  const workId = randomUUID();
  const image = await storeImage(input, workId);
  const Work = getWorkModel();
  await Work.create({
    workId,
    authorId: null,
    desc: '',
    images: [{ url: image.url, name: image.filename, type: image.contentType }],
    tags: [],
    status: 'published',
    classroomId: input.classId,
    participantId: input.participantId,
    uploaderRole: input.uploaderRole,
    uploadReason: input.uploadReason,
    contentHash: image.contentHash,
  });
  return workId;
}

export async function replaceClassroomArtwork(
  input: ClassroomArtworkInput,
  artworkId: string
): Promise<ClassroomArtworkReplacement> {
  const Work = getWorkModel();
  const current = await Work.findOne({
    workId: artworkId,
    classroomId: input.classId,
    participantId: input.participantId,
  }).lean().exec();
  if (!current) throw new Error('ARTWORK_NOT_FOUND');
  const replacementId = `${artworkId}-correction-${randomUUID()}`;
  const image = await storeImage(input, replacementId, artworkId);
  await Work.updateOne(
    { workId: artworkId },
    {
      $set: {
        images: [{ url: image.url, name: image.filename, type: image.contentType }],
        uploaderRole: input.uploaderRole,
        uploadReason: input.uploadReason,
        contentHash: image.contentHash,
      },
      $unset: { healing: 1 },
    }
  ).exec();
  return {
    artworkId,
    previousImageUrl: current.images[0]?.url,
    replacementImageUrl: image.url,
    previousContentHash: current.contentHash,
    replacementContentHash: image.contentHash,
  };
}
