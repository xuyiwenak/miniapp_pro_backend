// 文件顶部
import { ComponentManager, EComName, IBaseComponent } from '../common/BaseComponent';
import { getPlayerModel } from '../dbservice/model/ZoneDBModel';
import { gameLogger } from '../util/logger';
import { v4 as uuidv4 } from 'uuid';
import { AccountLevel } from '../shared/enum/AccountLevel';
import { getAccessToken } from '../util/wxAccessToken';
import https from 'https';

type PlayerDTO = {
  userId: string;
  account: string;
  nickname?: string;
  zoneId?: string;
  openId?: string;
};

type PlayerResult =
  | { ok: true; data: PlayerDTO }
  | { ok: false; error: string };

export class PlayerComponent implements IBaseComponent {
  // 当前服默认区，start 时从 SysCfg 取
  private defaultZone: string = 'zone1';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  init(): void {}

  async start(): Promise<void> {
    const sysCfg = ComponentManager.instance.getComponent(
      EComName.SysCfgComponent,
    );
    const zoneIdList = sysCfg.server?.zoneIdList ?? [];
    this.defaultZone = zoneIdList[0] ?? 'zone1';
    if (!zoneIdList.length) {
      gameLogger.warn('PlayerComponent: zoneIdList is empty in zone_config.json, falling back to default zone "zone1"');
    }
    gameLogger.debug('PlayerComponent start, defaultZone=', this.defaultZone);
  }

  async afterStart(): Promise<void> {
    gameLogger.debug('PlayerComponent afterStart');
  }

  async stop(): Promise<void> {
    gameLogger.debug('PlayerComponent stop');
  }

  public getDefaultZoneId(): string {
    return this.defaultZone;
  }

  /**
   * 按 userId 查询该用户的微信 openId（用于内容安全等接口）。
   * 仅微信登录并绑定过的用户才有 openId。
   */
  async getOpenIdByUserId(userId: string): Promise<string | undefined> {
    if (!this.defaultZone) return undefined;
    try {
      const Player = getPlayerModel(this.defaultZone);
      const player = await Player.findOne({ userId }).select('openId').lean().exec();
      return player?.openId ?? undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * 只查询：按 openId 查找玩家（不自动注册）
   */
  async findByOpenId(openId: string): Promise<PlayerResult> {
    if (!this.defaultZone) {
      return { ok: false, error: 'DefaultZoneNotReady' };
    }
    try {
      const Player = getPlayerModel(this.defaultZone);
      const player = await Player.findOne({ openId }).exec();
      if (!player) {
        return { ok: false, error: 'NotFound' };
      }
      return {
        ok: true,
        data: {
          userId: player.userId,
          account: player.account,
          nickname: player.nickname,
          zoneId: player.zoneId,
          openId: player.openId ?? openId,
        },
      };
    } catch (err) {
      gameLogger.error('findByOpenId exception, openId=', openId, err);
      return { ok: false, error: 'FindByOpenIdException' };
    }
  }

  /**
   * 注册账号：同账号不存在则创建
   */
  async register(account: string, password: string): Promise<PlayerResult> {
    if (!this.defaultZone) {
      gameLogger.error(
        'register failed: defaultZone is empty, account=',
        account,
      );
      return { ok: false, error: 'DefaultZoneNotReady' };
    }

    try {
      const Player = getPlayerModel(this.defaultZone); // 用默认区
      const exist = await Player.findOne({ account }).exec();
      if (exist) {
        gameLogger.warn('register failed: account exists, account=', account);
        return { ok: false, error: 'AccountExists' };
      }

      const userId = uuidv4();
      const zoneId = this.defaultZone;
      const created = await Player.create({
        userId,
        account,
        password, // 当前方案明文存储，后续可改为哈希
        zoneId,
        level: AccountLevel.User,
      });

      gameLogger.info(
        'register success, account=',
        account,
        'userId=',
        userId,
        'zoneId=',
        zoneId,
      );

      return {
        ok: true,
        data: {
          userId: created.userId,
          account: created.account,
          nickname: created.nickname,
          zoneId: created.zoneId,
        },
      };
    } catch (err) {
      gameLogger.error('register exception, account=', account, err);
      return { ok: false, error: 'RegisterException' };
    }
  }

  /*
   * 登录：账号 + 密码校验
   */
  async login(account: string, password: string): Promise<PlayerResult> {
    if (!this.defaultZone) {
      gameLogger.error(
        'login failed: defaultZone is empty, account=',
        account,
      );
      return { ok: false, error: 'DefaultZoneNotReady' };
    }

    try {
      const Player = getPlayerModel(this.defaultZone); // 用默认区
      const player = await Player.findOne({ account }).exec();

      if (!player) {
        gameLogger.warn('login failed: account not found, account=', account);
        return { ok: false, error: 'AccountNotFound' };
      }

      if (player.password !== password) {
        gameLogger.warn('login failed: password error, account=', account);
        return { ok: false, error: 'PasswordError' };
      }

      gameLogger.info(
        'login success, account=',
        account,
        'userId=',
        player.userId,
        'zoneId=',
        player.zoneId,
      );

      return {
        ok: true,
        data: {
          userId: player.userId,
          account: player.account,
          nickname: player.nickname,
          zoneId: player.zoneId,
          openId: player.openId ?? undefined,
        },
      };
    } catch (err) {
      gameLogger.error('login exception, account=', account, err);
      return { ok: false, error: 'LoginException' };
    }
  }

  /**
   * 使用微信 openId 登录：按 openId 查找或自动注册
   */
  async loginByOpenId(openId: string): Promise<PlayerResult> {
    if (!this.defaultZone) {
      gameLogger.error(
        'loginByOpenId failed: defaultZone is empty, openId=',
        openId,
      );
      return { ok: false, error: 'DefaultZoneNotReady' };
    }

    try {
      const Player = getPlayerModel(this.defaultZone);

      // 1. 尝试按 openId 查找已有玩家
      let player = await Player.findOne({ openId }).exec();
      if (player) {
        gameLogger.info(
          'loginByOpenId success (existing), openId=',
          openId,
          'userId=',
          player.userId,
          'zoneId=',
          player.zoneId,
        );

        return {
          ok: true,
          data: {
            userId: player.userId,
            account: player.account,
            nickname: player.nickname,
            zoneId: player.zoneId,
            openId: player.openId ?? openId,
          },
        };
      }

      // 2. 不存在则自动注册一个账号
      const userId = uuidv4();
      const zoneId = this.defaultZone;
      const account = `wx_${openId}`;

      player = await Player.create({
        userId,
        account,
        password: undefined,
        zoneId,
        openId,
        level: AccountLevel.User,
      });

      gameLogger.info(
        'loginByOpenId auto register success, openId=',
        openId,
        'userId=',
        userId,
        'zoneId=',
        zoneId,
      );

      return {
        ok: true,
        data: {
          userId: player.userId,
          account: player.account,
          nickname: player.nickname,
          zoneId: player.zoneId,
          openId: player.openId ?? openId,
        },
      };
    } catch (err) {
      gameLogger.error('loginByOpenId exception, openId=', openId, err);
      return { ok: false, error: 'LoginByOpenIdException' };
    }
  }

  /**
   * 创建角色：为已有账号设置昵称
   */
  async createRole(userId: string, nickname: string): Promise<PlayerResult> {
    if (!this.defaultZone) {
      gameLogger.error(
        'createRole failed: defaultZone is empty, userId=',
        userId,
      );
      return { ok: false, error: 'DefaultZoneNotReady' };
    }

    try {
      const Player = getPlayerModel(this.defaultZone);
      const player = await Player.findOne({ userId }).exec();

      if (!player) {
        gameLogger.warn('createRole failed: user not found, userId=', userId);
        return { ok: false, error: 'UserNotFound' };
      }

      if (player.nickname) {
        gameLogger.warn(
          'createRole failed: role already exists, userId=',
          userId,
        );
        return { ok: false, error: 'RoleAlreadyExists' };
      }

      player.nickname = nickname;
      await player.save();

      gameLogger.info(
        'createRole success, userId=',
        userId,
        'nickname=',
        nickname,
      );

      return {
        ok: true,
        data: {
          userId: player.userId,
          account: player.account,
          nickname: player.nickname,
          zoneId: player.zoneId,
        },
      };
    } catch (err) {
      gameLogger.error('createRole exception, userId=', userId, err);
      return { ok: false, error: 'CreateRoleException' };
    }
  }

  /**
   * 按手机号查找用户（用于网站手机号登录）
   */
  async findByPhone(phone: string): Promise<PlayerResult> {
    if (!this.defaultZone) return { ok: false, error: 'DefaultZoneNotReady' };
    try {
      const Player = getPlayerModel(this.defaultZone);
      const player = await Player.findOne({ phone }).exec();
      if (!player) return { ok: false, error: 'NotFound' };
      return {
        ok: true,
        data: {
          userId: player.userId,
          account: player.account,
          nickname: player.nickname,
          zoneId: player.zoneId,
          openId: player.openId ?? undefined,
        },
      };
    } catch (err) {
      gameLogger.error('findByPhone exception, phone=', phone, err);
      return { ok: false, error: 'FindByPhoneException' };
    }
  }

  /**
   * 绑定手机号：用微信 getPhoneNumber code 换取手机号并保存
   */
  async bindPhone(userId: string, wxCode: string): Promise<{ ok: true; phone: string } | { ok: false; error: string }> {
    if (!this.defaultZone) return { ok: false, error: 'DefaultZoneNotReady' };

    const sysCfgComp = ComponentManager.instance.getComponent(EComName.SysCfgComponent) as {
      server_auth_config?: { wx_miniapp?: { appId?: string } };
    } | null;
    const appId = sysCfgComp?.server_auth_config?.wx_miniapp?.appId;
    if (!appId) return { ok: false, error: 'WxConfigMissing' };

    let phone: string;
    try {
      const accessToken = await getAccessToken();
      const body = JSON.stringify({ code: wxCode });
      const phoneResp = await new Promise<{ phone_info?: { purePhoneNumber?: string }; errcode?: number; errmsg?: string }>(
        (resolve, reject) => {
          const req = https.request(
            `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(accessToken)}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
            (wxRes) => {
              const chunks: Buffer[] = [];
              wxRes.on('data', (d) => chunks.push(d));
              wxRes.on('end', () => {
                try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
                catch (e) { reject(e); }
              });
            },
          );
          req.on('error', reject);
          req.write(body);
          req.end();
        },
      );
      const rawPhone = phoneResp?.phone_info?.purePhoneNumber;
      if (!rawPhone) {
        gameLogger.warn('bindPhone: wx returned no phone', phoneResp);
        return { ok: false, error: 'WxPhoneError' };
      }
      phone = rawPhone;
    } catch (err) {
      gameLogger.error('bindPhone wx request exception', err);
      return { ok: false, error: 'WxRequestException' };
    }

    try {
      const Player = getPlayerModel(this.defaultZone);
      await Player.updateOne({ userId }, { phone }).exec();
      gameLogger.info('bindPhone success, userId=', userId, 'phone=', phone);
      return { ok: true, phone };
    } catch (err) {
      gameLogger.error('bindPhone db exception, userId=', userId, err);
      return { ok: false, error: 'DbException' };
    }
  }

  /**
   * 进入区服：按传入 zoneId 查询该区角色
   */
  async enterZone(userId: string, zoneId: string): Promise<PlayerResult> {
    try {
      const Player = getPlayerModel(zoneId); // 用请求的区
      const player = await Player.findOne({ userId }).exec();

      if (!player) {
        gameLogger.warn(
          'enterZone failed: role not found in zone, userId=',
          userId,
          'zoneId=',
          zoneId,
        );
        return { ok: false, error: 'RoleNotFoundInZone' };
      }

      gameLogger.info(
        'enterZone success, userId=',
        userId,
        'zoneId=',
        zoneId,
      );

      return {
        ok: true,
        data: {
          userId: player.userId,
          account: player.account,
          nickname: player.nickname,
          zoneId: player.zoneId,
        },
      };
    } catch (err) {
      gameLogger.error(
        'enterZone exception, userId=',
        userId,
        'zoneId=',
        zoneId,
        err,
      );
      return { ok: false, error: 'EnterZoneException' };
    }
  }
}
