/**
 * /app 路由 - 小程序应用配置
 */
import { Router, Response } from 'express';
import { sendSucc } from '../../../../shared/miniapp/middleware/response';
import { loadSysConfigJson } from '../../../../util/load_json';

const router = Router();

interface OssImagesConfig {
  background: string;
  words_welcome: string;
  words_upload: string;
  icon_upload: string;
  icon_original: string;
  icon_image: string;
  icon_safe: string;
}

interface RuntimeConfig {
  oss_images?: OssImagesConfig;
}

// 默认 OSS URL（作为兜底，10年有效期）
const DEFAULT_OSS_IMAGES: OssImagesConfig = {
  background: 'https://image-miniapp001.oss-cn-wulanchabu.aliyuncs.com/mandis/mini_app_loading/images/background.webp?OSSAccessKeyId=LTAI5t8GB7eDYqEr9ea28pB8&Expires=2093077468&Signature=0UFU32APlX33mQby5FdauJy7N%2BQ%3D',
  words_welcome: 'https://image-miniapp001.oss-cn-wulanchabu.aliyuncs.com/mandis/mini_app_loading/images/words_welcome.webp?OSSAccessKeyId=LTAI5t8GB7eDYqEr9ea28pB8&Expires=2093077468&Signature=10D3T71sCC6BDnMHleooVroMOW4%3D',
  words_upload: 'https://image-miniapp001.oss-cn-wulanchabu.aliyuncs.com/mandis/mini_app_loading/images/words_upload.webp?OSSAccessKeyId=LTAI5t8GB7eDYqEr9ea28pB8&Expires=2093077468&Signature=CDd5gheyDU48ZUb5FuuV7Tn%2Fz6I%3D',
  icon_upload: 'https://image-miniapp001.oss-cn-wulanchabu.aliyuncs.com/mandis/mini_app_loading/images/icon-upload.webp?OSSAccessKeyId=LTAI5t8GB7eDYqEr9ea28pB8&Expires=2093077468&Signature=%2BfA6M2ZwUruerVsedSMnFH49JhA%3D',
  icon_original: 'https://image-miniapp001.oss-cn-wulanchabu.aliyuncs.com/mandis/mini_app_loading/images/icon-original.webp?OSSAccessKeyId=LTAI5t8GB7eDYqEr9ea28pB8&Expires=2093077468&Signature=UiV7NROZPQEW3ZSArKKfm%2FkGaZY%3D',
  icon_image: 'https://image-miniapp001.oss-cn-wulanchabu.aliyuncs.com/mandis/mini_app_loading/images/icon-image.webp?OSSAccessKeyId=LTAI5t8GB7eDYqEr9ea28pB8&Expires=2093077468&Signature=wYF6%2BVkbXFit3D%2BR1UOMVHJR7AU%3D',
  icon_safe: 'https://image-miniapp001.oss-cn-wulanchabu.aliyuncs.com/mandis/mini_app_loading/images/icon-safe.webp?OSSAccessKeyId=LTAI5t8GB7eDYqEr9ea28pB8&Expires=2093077468&Signature=AkiqWKnh7WkfIuZGAAxJCz%2BFwW0%3D',
};

/**
 * GET /app/config
 * 下发应用配置给前端（OSS 图片 URL 等）
 * 无需鉴权，供小程序启动时获取
 */
router.get('/config', (_req, res: Response) => {
  const [data] = loadSysConfigJson('runtime_config.json');
  const config = (data as RuntimeConfig) || {};
  const ossImages = config.oss_images || DEFAULT_OSS_IMAGES;

  sendSucc(res, {
    ossImages: {
      background: ossImages.background || DEFAULT_OSS_IMAGES.background,
      wordsWelcome: ossImages.words_welcome || DEFAULT_OSS_IMAGES.words_welcome,
      wordsUpload: ossImages.words_upload || DEFAULT_OSS_IMAGES.words_upload,
      iconUpload: ossImages.icon_upload || DEFAULT_OSS_IMAGES.icon_upload,
      iconOriginal: ossImages.icon_original || DEFAULT_OSS_IMAGES.icon_original,
      iconImage: ossImages.icon_image || DEFAULT_OSS_IMAGES.icon_image,
      iconSafe: ossImages.icon_safe || DEFAULT_OSS_IMAGES.icon_safe,
    },
  });
});

export default router;
