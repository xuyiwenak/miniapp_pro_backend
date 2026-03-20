import { ApiCall } from "tsrpc";
import {
  ReqCreateRole,
  ResCreateRole,
} from "../../../shared/public/instance/front_protocols/PtlCreateRole";
import { ServiceType } from "../../../shared/public/instance/front_protocols/serviceProto";
import { ComponentManager } from "../../../common/BaseComponent";
import type { PlayerComponent } from "../../../component/PlayerComponent";

export async function ApiCreateRole(
  call: ApiCall<ReqCreateRole, ResCreateRole, ServiceType>,
) {
  const { userId, nickname } = call.req;

  const playerComp =
    ComponentManager.instance.getComponentByKey<PlayerComponent>(
      "PlayerComponent",
    );

  if (!playerComp) {
    await call.error("CreateRole failed: PlayerComponentNotInitialized");
    return;
  }

  const ret = await playerComp.createRole(userId, nickname);

  if (!ret.ok) {
    await call.error(`CreateRole failed: ${ret.error}`);
    return;
  }

  const res: ResCreateRole = {
    roleId: ret.data.userId,
  };
  await call.succ(res);
}
