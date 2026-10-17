import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { uploadToOss, deleteFromOss, signOssUrl, type OssConfig } from '../../../shared/storage/oss';
import { LIMITS, type SmartCourseConfig } from '../config';
import { SmartCourseError } from '../errors';

export interface ArtworkStorage {
  upload(buffer: Buffer, courseId: string, participantId: string): Promise<string>;
  remove(key: string): Promise<void>;
  sign(key: string): string;
}
export async function normalizeArtwork(buffer: Buffer): Promise<Buffer> {
  try {
    return await sharp(buffer, { limitInputPixels: LIMITS.imagePixels, failOn: 'error' }).rotate()
      .resize(LIMITS.imageEdge, LIMITS.imageEdge, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: LIMITS.imageQuality }).toBuffer();
  } catch {
    throw new SmartCourseError(400, 'INVALID_IMAGE', '图片无法读取，请上传 JPG、PNG 或 WebP 图片');
  }
}
export function createArtworkStorage(config: SmartCourseConfig): ArtworkStorage {
  function resolve(): OssConfig {
    const { SMARTCOURSE_OSS_REGION: region, SMARTCOURSE_OSS_BUCKET: bucket,
      SMARTCOURSE_OSS_ACCESS_KEY_ID: accessKeyId, SMARTCOURSE_OSS_ACCESS_KEY_SECRET: accessKeySecret } = config;
    if (!region || !bucket || !accessKeyId || !accessKeySecret) {
      throw new SmartCourseError(503, 'STORAGE_NOT_CONFIGURED', '作品上传暂未配置，请联系教师');
    }
    return { region, bucket, accessKeyId, accessKeySecret,
      worksObjectPrefix: 'smartCourse/artworks', avatarObjectPrefix: 'smartCourse/avatars' };
  }
  return {
    async upload(buffer, courseId, participantId) {
      const cfg = resolve();
      const image = await normalizeArtwork(buffer);
      const key = `${cfg.worksObjectPrefix}/${courseId}/${participantId}/${randomUUID()}.jpg`;
      return uploadToOss(cfg, image, key, 'image/jpeg', true);
    },
    remove: key => deleteFromOss(resolve(), key),
    sign: key => signOssUrl(resolve(), key, LIMITS.signedUrlSeconds),
  };
}
