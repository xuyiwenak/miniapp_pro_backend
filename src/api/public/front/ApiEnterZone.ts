import { ApiCall } from "tsrpc";
import {
  ReqEnterZone,
  ResEnterZone,
} from "../../../shared/public/instance/front_protocols/PtlEnterZone";
import { ServiceType } from "../../../shared/public/instance/front_protocols/serviceProto";
import { ComponentManager } from "../../../common/BaseComponent";
import type { PlayerComponent } from "../../../component/PlayerComponent";

export async function ApiEnterZone(
  call: ApiCall<ReqEnterZone, ResEnterZone, ServiceType>,
) {
  const { userId, zoneId } = call.req;

  const playerComp =
    ComponentManager.instance.getComponentByKey<PlayerComponent>(
      "PlayerComponent",
    );

  if (!playerComp) {
    await call.error("EnterZone failed: PlayerComponentNotInitialized");
    return;
  }

  const ret = await playerComp.enterZone(userId, zoneId);

  if (!ret.ok) {
    await call.error(`EnterZone failed: ${ret.error}`);
    return;
  }

  const res: ResEnterZone = {
    zoneId: ret.data.zoneId ?? zoneId,
    serverTime: Date.now(),
  };
  await call.succ(res);
}
