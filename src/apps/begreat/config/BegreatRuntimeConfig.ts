/**
 * BegreatRuntimeConfig — 热加载业务运行时配置
 *
 * 与需要重启的静态配置（db、wx_pay 密钥等）分离。
 * 通过 POST /admin/reload-config 触发 reload()，无需重启容器。
 *
 * 配置文件：sysconfig/{env}/runtime_config.json
 * Docker 挂载路径同 SYSCONFIG_ROOT，修改文件后调接口即生效。
 */
import { loadSysConfigJson } from '../../../util/load_json';
import { gameLogger as logger } from '../../../util/logger';

/** OSS 图片 URL 配置 */
export interface OssImagesConfig {
  shareHome: string;
  shareHomeTimeline: string;
  wxacode: string;
}

export interface RuntimeConfig {
  price_fen: number;
  /** 是否开启支付。false 时所有用户直接视为已付费（用于维护/测试）*/
  payment_enabled: boolean;
  /** 跳过每日答题次数限制的 openId 白名单（开发者 / 测试账号）*/
  devOpenids: string[];
  /** OSS 图片签名 URL（10年有效期）*/
  ossImages: OssImagesConfig;
}

const DEFAULT_OSS_IMAGES: OssImagesConfig = {
  shareHome: '',
  shareHomeTimeline: '',
  wxacode: '',
};

const DEFAULTS: RuntimeConfig = {
  price_fen: 2900,
  payment_enabled: true,
  devOpenids: [],
  ossImages: { ...DEFAULT_OSS_IMAGES },
};

let _current: RuntimeConfig = { ...DEFAULTS };

function parseOssImages(raw: unknown): OssImagesConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_OSS_IMAGES };
  const obj = raw as Record<string, unknown>;
  return {
    shareHome:         typeof obj['share_home'] === 'string'          ? obj['share_home']          : DEFAULT_OSS_IMAGES.shareHome,
    shareHomeTimeline: typeof obj['share_home_timeline'] === 'string' ? obj['share_home_timeline'] : DEFAULT_OSS_IMAGES.shareHomeTimeline,
    wxacode:           typeof obj['wxacode'] === 'string'             ? obj['wxacode']             : DEFAULT_OSS_IMAGES.wxacode,
  };
}

function load(): RuntimeConfig {
  const [data, msg] = loadSysConfigJson('runtime_config.json');
  if (!data) {
    logger.warn(`[BegreatRuntimeConfig] 加载失败 (${msg})，使用默认值`);
    return { ...DEFAULTS, ossImages: { ...DEFAULT_OSS_IMAGES } };
  }
  const cfg = data as Record<string, unknown>;
  return {
    price_fen:       typeof cfg['price_fen']       === 'number'  ? cfg['price_fen']              : DEFAULTS.price_fen,
    payment_enabled: typeof cfg['payment_enabled'] === 'boolean' ? cfg['payment_enabled']         : DEFAULTS.payment_enabled,
    devOpenids:      Array.isArray(cfg['dev_openids'])           ? cfg['dev_openids'] as string[] : DEFAULTS.devOpenids,
    ossImages:       parseOssImages(cfg['oss_images']),
  };
}

/** 启动时初始化，由 server.ts 或 BegreatMongoComponent 调用 */
export function initRuntimeConfig(): void {
  _current = load();
  const ossKeys = Object.keys(_current.ossImages).filter(k => _current.ossImages[k as keyof OssImagesConfig]);
  logger.info(`[BegreatRuntimeConfig] 已加载: price_fen=${_current.price_fen} payment_enabled=${_current.payment_enabled} devOpenids=[${_current.devOpenids.join(',')}] ossImages=[${ossKeys.join(',')}]`);
}

/** 热加载：不重启服务直接从文件重新读取 */
export function reloadRuntimeConfig(): RuntimeConfig {
  const prev = { ..._current };
  _current = load();
  const ossKeys = Object.keys(_current.ossImages).filter(k => _current.ossImages[k as keyof OssImagesConfig]);
  logger.info(
    `[BegreatRuntimeConfig] 热加载完成: price_fen: ${prev.price_fen} → ${_current.price_fen}, ` +
    `payment_enabled: ${prev.payment_enabled} → ${_current.payment_enabled}, ` +
    `devOpenids: [${prev.devOpenids.join(',')}] → [${_current.devOpenids.join(',')}], ` +
    `ossImages: [${ossKeys.join(',')}]`
  );
  return { ..._current };
}

/** 获取当前运行时配置（只读快照） */
export function getRuntimeConfig(): Readonly<RuntimeConfig> {
  return _current;
}
