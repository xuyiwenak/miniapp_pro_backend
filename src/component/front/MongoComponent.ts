/*
 * @Author: lyh
 * @Github:
 * @FilePath: /InstanceServer/src/component/front/MongoComponent.ts
 * @Date: 2024-10-28 16:17:41
 * @LastEditors: lyh
 * @LastEditTime: 2025-01-09 18:00:36
 */
import {
  ComponentManager,
  EComName,
  IBaseComponent,
} from "../../common/BaseComponent";
import {
  getGlobalModelManager,
  initializeGlobalModel,
} from "../../dbservice/model/GlobalInfoDBModel";

import assert from "assert";
import {
  getServerModelManager,
  initializeServerModel,
} from "../../dbservice/model/ServerDBModel";
import {
  initializeZoneModel,
  stopAllZoneConnection,
} from "../../dbservice/model/ZoneDBModel";
import { BaseMongoComponent } from "../mongo/BaseMongoComponent";

export class MongoComponent extends BaseMongoComponent implements IBaseComponent {

  async start() {
    const sysCfgComp = ComponentManager.instance.getComponent(
      EComName.SysCfgComponent
    );

    // 先确认 mongo TCP 端口可达，再让 mongoose 尝试连接
    if (sysCfgComp.db_global?.host) {
      await this.waitForTcp(sysCfgComp.db_global.host, sysCfgComp.db_global.port ?? 27017);
    }
    if (sysCfgComp.db_global) {
      await this.connectWithRetry(() =>
        this.connectDb(sysCfgComp.db_global!, {
          connectedLog: "MongoDB connected",
          errorLog: "MongoDB connection error:",
          disconnectedLog: "MongoDB disconnected, mongoose will auto-reconnect",
          reconnectedLog: "MongoDB reconnected",
          onConnected: initializeGlobalModel,
        }),
      );
    }

    const server = sysCfgComp.server.serverId;
    const serverCfg = sysCfgComp.db_server_map.get(server);
    assert(
      serverCfg !== undefined,
      `Server config not found for serverId: ${server}`
    );
    await this.connectWithRetry(() =>
      this.connectDb(serverCfg, {
        connectedLog: "MongoDB connected",
        errorLog: "MongoDB connection error:",
        disconnectedLog: "MongoDB disconnected, mongoose will auto-reconnect",
        reconnectedLog: "MongoDB reconnected",
        onConnected: initializeServerModel,
      }),
    );

    const zoneList = sysCfgComp.server.zoneIdList;
    for (const zone of zoneList) {
      const zoneCfg = sysCfgComp.db_server_map.get(server);
      assert(
        zoneCfg !== undefined,
        `Server config not found for zone: ${zone}`
      );
      await this.connectWithRetry(() =>
        this.connectDb(zoneCfg, {
          connectedLog: `MongoDB zone connected ${zone}`,
          errorLog: `MongoDB zone connection error: ${zone}`,
          disconnectedLog: `MongoDB zone disconnected, auto-reconnect ${zone}`,
          reconnectedLog: `MongoDB zone reconnected ${zone}`,
          onConnected: (connection) => initializeZoneModel(connection, zone),
        }),
      );
    }
  }

  async stop() {
    await getGlobalModelManager().stopConnection();
    await getServerModelManager().stopConnection();
    await stopAllZoneConnection();
  }
}
