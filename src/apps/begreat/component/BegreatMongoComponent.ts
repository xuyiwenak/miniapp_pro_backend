import { ComponentManager, EComName, IBaseComponent } from "../../../common/BaseComponent";
import { BaseMongoComponent } from "../../../component/mongo/BaseMongoComponent";
import { initializeBegreatModels, stopBegreatConnection } from "../dbservice/BegreatDBModel";

export class BegreatMongoComponent extends BaseMongoComponent implements IBaseComponent {

  async start() {
    const sysCfgComp = ComponentManager.instance.getComponent(EComName.SysCfgComponent);
    const dbCfg = sysCfgComp.db_global;
    if (!dbCfg) throw new Error("[Begreat] db_global not configured");

    await this.waitForTcp(dbCfg.host, dbCfg.port ?? 27017);
    await this.connectWithRetry(() =>
      this.connectDb(dbCfg, {
        connectedLog: "[Begreat] MongoDB connected:",
        errorLog: "[Begreat] MongoDB error:",
        disconnectedLog: "[Begreat] MongoDB disconnected, auto-reconnect",
        reconnectedLog: "[Begreat] MongoDB reconnected",
        onConnected: (connection) => {
          initializeBegreatModels(connection);
        },
      }),
    );
  }

  async stop() {
    await stopBegreatConnection();
  }
}
