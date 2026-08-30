import { createHash, randomUUID } from 'crypto';
import { getWorkModel } from '../../../../dbservice/model/GlobalInfoDBModel';
import { checkImage } from '../../../../util/wxContentSecurity';
import { uploadToStorage } from '../../../../util/imageUploader';
import { getOssUploadPrefixes } from '../../../../util/ossUploader';
import { stripJpegExif } from './classroomResearch';

const MAX_ARTWORK_BYTES = 10 * 1024 * 1024;
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

function decodeImage(dataUrl: string): { buffer: Buffer; contentType: string } {
  const match = DATA_URL_PATTERN.exec(dataUrl);
  if (!match) throw new Error('INVALID_IMAGE_FORMAT');
  const contentType = match[1];
  const rawBuffer = Buffer.from(match[2], 'base64');
  if (rawBuffer.length === 0 || rawBuffer.length > MAX_ARTWORK_BYTES) {
    throw new Error('INVALID_IMAGE_SIZE');
  }
  if (!hasExpectedSignature(rawBuffer, contentType))
    throw new Error('INVALID_IMAGE_CONTENT');
  const buffer =
    contentType === 'image/jpeg' ? stripJpegExif(rawBuffer) : rawBuffer;
  return { buffer, contentType };
}

function hasExpectedSignature(buffer: Buffer, contentType: string): boolean {
  if (contentType === 'image/jpeg') {
    return (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }
  if (contentType === 'image/png') {
    return (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    );
  }
  return (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  );
}

async function ensureUniqueArtwork(
  classId: string,
  contentHash: string
): Promise<void> {
  const Work = getWorkModel();
  const duplicate = await Work.exists({
    classroomId: classId,
    contentHash,
  }).exec();
  if (duplicate) throw new Error('DUPLICATE_ARTWORK');
}

export async function createClassroomArtwork(
  input: ClassroomArtworkInput
): Promise<string> {
  const { buffer, contentType } = decodeImage(input.dataUrl);
  const security = await checkImage(buffer, contentType);
  if (!security.safe) throw new Error('UNSAFE_IMAGE');
  const contentHash = createHash('sha256').update(buffer).digest('hex');
  await ensureUniqueArtwork(input.classId, contentHash);
  const workId = randomUUID();
  const extension = EXTENSION_BY_TYPE[contentType];
  const { worksObjectPrefix } = getOssUploadPrefixes();
  const key = `${worksObjectPrefix}/classrooms/${input.classId}/${workId}.${extension}`;
  const url = await uploadToStorage(buffer, key, contentType);
  const Work = getWorkModel();
  await Work.create({
    workId,
    authorId: null,
    desc: '',
    images: [{ url, name: `${workId}.${extension}`, type: contentType }],
    tags: [],
    status: 'published',
    classroomId: input.classId,
    participantId: input.participantId,
    uploaderRole: input.uploaderRole,
    uploadReason: input.uploadReason,
    contentHash,
  });
  return workId;
}
