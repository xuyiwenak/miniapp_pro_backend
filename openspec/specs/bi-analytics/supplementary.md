# BI Analytics - Supplementary Guide

## 补充字段和边界场景处理

### 1. 建议补充的字段

基于用户的实际需求分析，建议补充以下字段：

#### 1.1 上传事件补充字段

```typescript
export interface UploadFileDataEnhanced extends UploadFileData {
  // 现有字段
  bytes: number;
  contentType: string;
  width?: number;
  height?: number;
  durationMs: number;
  status: 'success' | 'failed';
  errorCode?: string;
  errorMessage?: string;

  // 建议补充的字段
  uploadSource: 'camera' | 'album' | 'clipboard' | 'drag_drop'; // 上传来源
  compressionRatio?: number; // 压缩比例（原始大小/压缩后大小）
  originalBytes?: number; // 压缩前的原始大小
  cdnUrl?: string; // CDN加速URL
  ossKey?: string; // OSS存储key
  retryCount?: number; // 重试次数（如果失败后重试）
  networkType?: 'wifi' | '4g' | '5g' | 'unknown'; // 网络类型（小程序可获取）
  uploadSpeed?: number; // 上传速度 (bytes/second)

  // 图片特有
  format?: 'jpeg' | 'png' | 'webp' | 'gif'; // 图片格式
  colorSpace?: 'rgb' | 'grayscale'; // 色彩空间
  hasAlpha?: boolean; // 是否有透明通道

  // 业务关联
  workId?: string; // 关联的作品ID（如果是作品上传）
  userId?: string; // 上传用户ID（冗余，便于查询）
  scene?: 'work_upload' | 'avatar_upload' | 'comment_upload'; // 上传场景
}
```

#### 1.2 Qwen分析补充字段

```typescript
export interface QwenAnalyzeDataEnhanced extends QwenAnalyzeData {
  // 现有字段
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
  cost: number;
  durationMs: number;
  workId?: string;
  imageUrl?: string;
  status: 'success' | 'failed';
  errorCode?: string;
  errorMessage?: string;

  // 建议补充的字段
  analysisType?: 'artwork' | 'portrait' | 'general'; // 分析类型
  isArtwork?: boolean; // 是否识别为艺术作品
  confidenceScore?: number; // 识别置信度 (0-1)

  // 分析结果摘要（便于统计）
  emotionScores?: {
    joy?: number;
    calm?: number;
    anxiety?: number;
    // ... 其他情绪
  };
  vadScores?: {
    valence?: number;
    arousal?: number;
    dominance?: number;
  };

  // 性能相关
  queueWaitMs?: number; // 队列等待时间
  inferenceMs?: number; // 实际推理时间
  retryCount?: number; // 重试次数

  // 业务关联
  userId?: string; // 分析请求用户
  scene?: 'work_analysis' | 'batch_analysis'; // 分析场景

  // 成本优化相关
  cacheHit?: boolean; // 是否命中缓存（如果实现了结果缓存）
  modelVersion?: string; // 模型版本号（用于A/B测试）
}
```

#### 1.3 API请求补充字段

```typescript
export interface ApiRequestDataEnhanced extends ApiRequestData {
  // 现有字段
  endpoint: string;
  method: string;
  statusCode: number;
  durationMs: number;
  requestSize: number;
  responseSize: number;
  status: 'success' | 'failed';
  errorCode?: string;
  errorMessage?: string;

  // 建议补充的字段
  // 性能分解
  dnsLookupMs?: number; // DNS解析时间
  tcpConnectionMs?: number; // TCP连接时间
  sslHandshakeMs?: number; // SSL握手时间
  serverProcessingMs?: number; // 服务器处理时间
  contentTransferMs?: number; // 内容传输时间

  // 请求详情
  queryParams?: Record<string, string>; // 查询参数（敏感信息需脱敏）
  routeParams?: Record<string, string>; // 路由参数
  requestHeaders?: string[]; // 请求头（白名单，如Content-Type, Accept）

  // 业务标识
  serviceName?: string; // 服务名称（如果是微服务架构）
  apiVersion?: string; // API版本
  businessType?: 'query' | 'mutation' | 'batch'; // 业务类型

  // 缓存相关
  cacheStatus?: 'hit' | 'miss' | 'bypass'; // 缓存状态

  // 限流/熔断
  rateLimited?: boolean; // 是否触发限流
  circuitBreakerOpen?: boolean; // 熔断器是否打开

  // 数据库相关
  dbQueryCount?: number; // 数据库查询次数
  dbQueryMs?: number; // 数据库查询总耗时

  // Redis相关
  redisHitCount?: number; // Redis命中次数
  redisMissCount?: number; // Redis未命中次数
}
```

#### 1.4 通用事件上下文补充字段

```typescript
export interface EventContextEnhanced extends EventContext {
  // 现有字段
  userId: string | null;
  sessionId: string;
  requestId: string;
  appName: AppName;
  platform: Platform;
  appVersion: string;
  ipAddress: string;
  userAgent: string;

  // 建议补充的字段
  // 地理位置（基于IP解析，匿名化）
  country?: string; // 国家
  province?: string; // 省份
  city?: string; // 城市（可选，考虑隐私）

  // 设备信息
  deviceId?: string; // 设备唯一标识（加密后的）
  deviceType?: 'mobile' | 'tablet' | 'desktop'; // 设备类型
  deviceBrand?: string; // 设备品牌（如iPhone, Huawei）
  deviceModel?: string; // 设备型号
  osName?: 'ios' | 'android' | 'windows' | 'macos' | 'linux'; // 操作系统
  osVersion?: string; // 操作系统版本
  screenResolution?: string; // 屏幕分辨率（如 1920x1080）

  // 网络信息
  networkType?: 'wifi' | '4g' | '5g' | '3g' | '2g' | 'unknown'; // 网络类型
  isp?: string; // 运营商（可选）

  // 应用状态
  isFirstSession?: boolean; // 是否首次会话
  isNewUser?: boolean; // 是否新用户
  daysSinceInstall?: number; // 安装后天数

  // 推荐/来源
  referrer?: string; // 来源页面（web）
  utmSource?: string; // UTM来源
  utmMedium?: string; // UTM媒介
  utmCampaign?: string; // UTM活动

  // 实验/分组
  experimentIds?: string[]; // 参与的实验ID列表
  abTestGroup?: string; // A/B测试分组

  // 时区
  timezone?: string; // 用户时区（如 Asia/Shanghai）
  timezoneOffset?: number; // 时区偏移（分钟）
}
```

### 2. 边界场景处理

#### 2.1 数据完整性边界

```typescript
// src/util/BiAnalytics.ts

/**
 * 处理缺失字段：使用默认值和验证
 */
export function sanitizeEventData(data: Partial<EventData>): EventData {
  // 示例：处理durationMs缺失或异常
  if (typeof data.durationMs !== 'number' || data.durationMs < 0) {
    data.durationMs = 0;
  }

  // 限制最大值，防止异常数据
  if (data.durationMs > 600000) {
    // 超过10分钟，可能是异常
    logger.warn('Abnormal durationMs detected', { durationMs: data.durationMs });
    data.durationMs = 600000; // 截断到最大值
  }

  // 处理bytes缺失
  if ('bytes' in data && (typeof data.bytes !== 'number' || data.bytes < 0)) {
    data.bytes = 0;
  }

  // 处理status缺失
  if (!data.status) {
    data.status = 'success'; // 默认成功
  }

  return data as EventData;
}

/**
 * 处理用户ID缺失：使用匿名用户ID
 */
export function getUserIdOrAnonymous(userId: string | null | undefined): string | null {
  if (!userId || userId === 'undefined' || userId === 'null') {
    return null; // 匿名用户
  }
  return userId;
}

/**
 * 处理会话ID缺失：生成临时会话ID
 */
export function getOrGenerateSessionId(sessionId?: string): string {
  if (sessionId && sessionId.length > 0) {
    return sessionId;
  }

  // 生成临时会话ID（带标记，便于识别）
  return `temp_session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}
```

#### 2.2 性能边界场景

```typescript
/**
 * 处理高峰流量：批量写入+背压控制
 */
export class BiAnalytics {
  private eventQueue: BiEvent[] = [];
  private readonly MAX_QUEUE_SIZE = 1000; // 最大队列长度
  private isFlushinging = false;

  async track(options: TrackOptions): Promise<void> {
    // 队列满时，直接丢弃或写入文件
    if (this.eventQueue.length >= this.MAX_QUEUE_SIZE) {
      logger.error('BiAnalytics queue full, event dropped', {
        queueSize: this.eventQueue.length,
        eventType: options.eventType,
      });

      // 备选方案：写入文件系统
      await this.fallbackToFile(options);
      return;
    }

    // ... 正常处理
  }

  /**
   * 备选方案：写入文件系统（MongoDB不可用时）
   */
  private async fallbackToFile(options: TrackOptions): Promise<void> {
    const logLine = JSON.stringify({
      ...this.buildEvent(options),
      _fallback: true,
    });

    await fs.promises.appendFile(
      `/var/log/bi_events_fallback_${new Date().toISOString().split('T')[0]}.log`,
      logLine + '\n',
      'utf8',
    );
  }
}
```

#### 2.3 数据质量边界

```typescript
/**
 * 检测异常数据：标记并告警
 */
export function detectAnomalies(event: BiEvent): void {
  const anomalies: string[] = [];

  // 检测1：超长请求时间
  if (event.data.durationMs > 60000) {
    anomalies.push('LONG_DURATION');
  }

  // 检测2：超大文件
  if ('bytes' in event.data && event.data.bytes > 50 * 1024 * 1024) {
    anomalies.push('LARGE_FILE');
  }

  // 检测3：高错误率用户
  // （需要查询历史数据，这里简化）

  // 检测4：异常IP（暴力攻击）
  if (event.ipAddress && isBlockedIp(event.ipAddress)) {
    anomalies.push('BLOCKED_IP');
  }

  if (anomalies.length > 0) {
    logger.warn('BiAnalytics: anomaly detected', {
      eventId: event.eventId,
      anomalies,
    });

    // 可选：发送告警
    // await sendAlert('BI Anomaly', `Event ${event.eventId} has anomalies: ${anomalies}`);
  }
}
```

#### 2.4 隐私合规边界

```typescript
/**
 * 脱敏处理：移除PII（个人可识别信息）
 */
export function sanitizeForPrivacy(event: Partial<BiEvent>): Partial<BiEvent> {
  // 1. IP地址匿名化
  if (event.ipAddress) {
    event.ipAddress = anonymizeIp(event.ipAddress);
  }

  // 2. User Agent截断（保留前100字符）
  if (event.userAgent && event.userAgent.length > 100) {
    event.userAgent = event.userAgent.substring(0, 100) + '...';
  }

  // 3. 移除URL中的敏感查询参数
  if (event.data && 'endpoint' in event.data) {
    event.data.endpoint = removeSensitiveParams(event.data.endpoint);
  }

  // 4. 不存储文件内容或图片URL的完整路径
  if (event.data && 'imageUrl' in event.data && event.data.imageUrl) {
    // 只保留域名+前20字符
    const url = new URL(event.data.imageUrl);
    event.data.imageUrl = url.origin + url.pathname.substring(0, 20) + '...';
  }

  return event;
}

function removeSensitiveParams(endpoint: string): string {
  const sensitiveParams = ['token', 'password', 'secret', 'key', 'access_token'];

  try {
    const url = new URL(endpoint, 'http://dummy.com');
    sensitiveParams.forEach((param) => {
      if (url.searchParams.has(param)) {
        url.searchParams.set(param, '***');
      }
    });
    return url.pathname + url.search;
  } catch {
    return endpoint;
  }
}
```

#### 2.5 错误恢复边界

```typescript
/**
 * MongoDB连接断开时的恢复策略
 */
export class BiAnalytics {
  private dbHealthy = true;
  private lastHealthCheck = Date.now();
  private readonly HEALTH_CHECK_INTERVAL_MS = 30000; // 30秒

  async track(options: TrackOptions): Promise<void> {
    // 定期检查数据库健康状态
    if (Date.now() - this.lastHealthCheck > this.HEALTH_CHECK_INTERVAL_MS) {
      await this.checkDbHealth();
    }

    if (!this.dbHealthy) {
      // 数据库不健康，写入文件
      await this.fallbackToFile(options);
      return;
    }

    // 正常处理
    try {
      const event = this.buildEvent(options);
      this.eventQueue.push(event);

      if (this.eventQueue.length >= this.BATCH_SIZE) {
        await this.flush();
      }
    } catch (error) {
      logger.error('BiAnalytics.track failed', { error });
      // 标记数据库不健康
      this.dbHealthy = false;
      // 重试写入文件
      await this.fallbackToFile(options);
    }
  }

  private async checkDbHealth(): Promise<void> {
    this.lastHealthCheck = Date.now();

    try {
      // Ping数据库
      await this.db?.admin().ping();
      this.dbHealthy = true;
    } catch (error) {
      logger.error('BiAnalytics: DB health check failed', { error });
      this.dbHealthy = false;
    }
  }
}
```

### 3. 扩展性设计

#### 3.1 未来可能添加的事件类型

```typescript
// 建议预留的事件类型
export const FUTURE_EVENT_TYPES = {
  // 用户行为事件
  USER_LOGIN: 'user_login',
  USER_LOGOUT: 'user_logout',
  USER_REGISTER: 'user_register',

  // 内容交互事件
  WORK_VIEW: 'work_view', // 作品查看
  WORK_LIKE: 'work_like', // 作品点赞
  WORK_SHARE: 'work_share', // 作品分享
  COMMENT_POST: 'comment_post', // 发表评论

  // 支付相关事件
  PAYMENT_INITIATED: 'payment_initiated', // 发起支付
  PAYMENT_SUCCESS: 'payment_success', // 支付成功
  PAYMENT_FAILED: 'payment_failed', // 支付失败

  // 系统事件
  ERROR_OCCURRED: 'error_occurred', // 应用错误
  CRASH_REPORT: 'crash_report', // 应用崩溃
  PERFORMANCE_WARNING: 'performance_warning', // 性能警告

  // A/B测试事件
  EXPERIMENT_EXPOSURE: 'experiment_exposure', // 实验曝光
  EXPERIMENT_CONVERSION: 'experiment_conversion', // 实验转化
} as const;
```

#### 3.2 插件化架构

```typescript
// src/util/BiPlugins.ts

/**
 * BI插件接口
 */
export interface BiPlugin {
  name: string;

  /**
   * 事件发送前的钩子（可修改事件）
   */
  beforeTrack?(event: Partial<BiEvent>): Promise<Partial<BiEvent>>;

  /**
   * 事件发送后的钩子
   */
  afterTrack?(event: BiEvent): Promise<void>;

  /**
   * 插件初始化
   */
  initialize?(): Promise<void>;

  /**
   * 插件销毁
   */
  destroy?(): Promise<void>;
}

/**
 * 示例插件：自动添加地理位置信息
 */
export class GeoLocationPlugin implements BiPlugin {
  name = 'GeoLocation';
  private ipGeoCache = new Map<string, { country: string; province: string }>();

  async beforeTrack(event: Partial<BiEvent>): Promise<Partial<BiEvent>> {
    if (!event.ipAddress) return event;

    // 查询缓存
    let geo = this.ipGeoCache.get(event.ipAddress);

    if (!geo) {
      // 调用IP地理位置服务（如ip2region）
      geo = await this.lookupGeo(event.ipAddress);
      this.ipGeoCache.set(event.ipAddress, geo);
    }

    // 添加地理位置信息到上下文
    (event as any).country = geo.country;
    (event as any).province = geo.province;

    return event;
  }

  private async lookupGeo(ip: string): Promise<{ country: string; province: string }> {
    // 实际实现应调用ip2region或其他服务
    return { country: 'CN', province: 'Beijing' };
  }
}

/**
 * BiAnalytics增强：支持插件
 */
export class BiAnalyticsWithPlugins extends BiAnalytics {
  private plugins: BiPlugin[] = [];

  registerPlugin(plugin: BiPlugin): void {
    this.plugins.push(plugin);
    plugin.initialize?.();
  }

  async track(options: TrackOptions): Promise<void> {
    let event = this.buildEvent(options);

    // 执行beforeTrack钩子
    for (const plugin of this.plugins) {
      if (plugin.beforeTrack) {
        event = await plugin.beforeTrack(event);
      }
    }

    // 正常处理（插入队列等）
    await super.track({ ...options, data: event.data! });

    // 执行afterTrack钩子
    for (const plugin of this.plugins) {
      if (plugin.afterTrack) {
        await plugin.afterTrack(event as BiEvent);
      }
    }
  }
}
```

### 4. 最佳实践

#### 4.1 打点时机建议

```typescript
// ❌ 不推荐：在循环中打点
for (const item of items) {
  await BiAnalytics.track({ ... }); // 会产生大量事件
}

// ✅ 推荐：批量操作只打一次点
const result = await batchProcess(items);
await BiAnalytics.track({
  eventType: 'batch_process',
  data: {
    itemCount: items.length,
    successCount: result.successCount,
    durationMs: result.durationMs,
  },
});
```

#### 4.2 成本优化建议

```typescript
// Qwen分析成本优化：
// 1. 使用结果缓存（相同图片不重复分析）
const cacheKey = `qwen:${imageUrl}`;
const cached = await redis.get(cacheKey);
if (cached) {
  // 命中缓存，不调用Qwen，也打点记录
  await BiAnalytics.track({
    eventType: EVENT_TYPES.QWEN_ANALYZE,
    data: {
      totalTokens: 0,
      cost: 0,
      durationMs: 0,
      cacheHit: true, // 补充字段
      status: 'success',
    },
  });
  return JSON.parse(cached);
}

// 2. 根据场景选择合适的模型
const model = scene === 'preview' ? 'qwen-vl-plus' : 'qwen-vl-max';

// 3. 定期生成成本报表，提醒超预算
```

#### 4.3 查询性能优化

```typescript
// ✅ 推荐：查询聚合表（快）
const metrics = await queryMetrics(startTime, endTime, 'daily');

// ❌ 不推荐：查询原始事件表（慢）
const events = await eventsCollection.find({ timestamp: { $gte: startTime, $lt: endTime } });

// ✅ 推荐：限制查询范围
const recentErrors = await queryErrorAnalysis(
  new Date(Date.now() - 24 * 60 * 60 * 1000), // 只查最近24小时
  new Date(),
  'mandis',
  20, // 只要Top 20
);

// ❌ 不推荐：查询所有历史数据
const allErrors = await queryErrorAnalysis(new Date(0), new Date());
```

### 5. FAQ (常见问题)

#### Q1: 为什么需要sessionId和requestId？

**A**:
- `sessionId`: 追踪用户会话（一次打开到关闭），用于分析用户行为路径、会话时长
- `requestId`: 追踪单次请求（用于分布式追踪），便于关联多个服务的日志

#### Q2: 如何处理小程序和Web的差异？

**A**:
```typescript
// 小程序端
wx.getNetworkType({
  success: (res) => {
    BiAnalytics.track({
      // ...
      context: {
        platform: 'miniprogram',
        networkType: res.networkType, // 'wifi', '4g', etc.
      },
    });
  },
});

// Web端
BiAnalytics.track({
  // ...
  context: {
    platform: 'web',
    networkType: navigator.onLine ? 'online' : 'offline',
    screenResolution: `${window.screen.width}x${window.screen.height}`,
  },
});
```

#### Q3: 如何避免打点影响业务性能？

**A**:
1. **异步非阻塞**：打点使用异步fire-and-forget模式
2. **批量写入**：攒够100条再批量写入MongoDB
3. **错误隔离**：打点失败不影响业务逻辑
4. **降级策略**：MongoDB不可用时写文件

#### Q4: 如何确保数据不丢失？

**A**:
1. **内存队列**：事件先缓存在内存队列
2. **定时刷新**：每5秒或100条自动刷新
3. **优雅退出**：进程退出前强制刷新队列
4. **文件备份**：MongoDB写入失败时fallback到文件
5. **重试机制**：失败事件重试3次

#### Q5: 如何保护用户隐私？

**A**:
1. **IP匿名化**：192.168.1.123 → 192.168.1.0
2. **不存储敏感数据**：不存储密码、token、手机号
3. **URL脱敏**：移除URL中的token等参数
4. **图片URL截断**：只保留域名+前缀
5. **GDPR合规**：90天TTL自动删除

#### Q6: 聚合任务失败怎么办？

**A**:
- 定时任务会自动重试（下一个周期）
- 可手动执行聚合脚本：
  ```bash
  npm run aggregate:hourly -- --start "2026-05-06T14:00:00Z" --end "2026-05-06T15:00:00Z"
  ```
- 聚合失败不影响原始事件存储

#### Q7: 如何扩展新的事件类型？

**A**:
```typescript
// 1. 定义新事件类型
export const EVENT_TYPES = {
  // ... 现有类型
  USER_LOGIN: 'user_login', // 新增
} as const;

// 2. 定义数据schema
export interface UserLoginData {
  loginMethod: 'wechat' | 'phone' | 'email';
  durationMs: number;
  status: 'success' | 'failed';
  errorCode?: string;
  // ...
}

// 3. 添加Zod验证
export const UserLoginDataSchema = z.object({
  loginMethod: z.enum(['wechat', 'phone', 'email']),
  durationMs: z.number().int().min(0),
  status: z.enum(['success', 'failed']),
  // ...
});

// 4. 使用
await BiAnalytics.track({
  eventType: EVENT_TYPES.USER_LOGIN,
  data: {
    loginMethod: 'wechat',
    durationMs: 1234,
    status: 'success',
  },
});
```

## 总结

本文档补充了以下内容：

1. ✅ **补充字段** - 上传、Qwen、API、上下文的增强字段
2. ✅ **边界场景** - 数据完整性、性能、质量、隐私、错误恢复
3. ✅ **扩展性** - 未来事件类型、插件化架构
4. ✅ **最佳实践** - 打点时机、成本优化、查询优化
5. ✅ **FAQ** - 常见问题解答

完整的BI数据采集系统设计已完成，可以根据实际需求选择性实施。
