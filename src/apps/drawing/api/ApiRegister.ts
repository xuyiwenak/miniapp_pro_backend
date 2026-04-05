import { ApiCall } from "tsrpc";
import {
  ReqRegister,
  ResRegister,
} from "../protocols/PtlRegister";
import { ServiceType } from "../protocols/serviceProto";
import { ComponentManager } from "../../../common/BaseComponent";
import type { PlayerComponent } from "../../../component/PlayerComponent";

export async function ApiRegister(
  call: ApiCall<ReqRegister, ResRegister, ServiceType>
) {
  const { account, password } = call.req;

  const playerComp =
    ComponentManager.instance.getComponentByKey<PlayerComponent>(
      "PlayerComponent",
    );

  if (!playerComp) {
    await call.error("Register failed: PlayerComponentNotInitialized");
    return;
  }

  const ret = await playerComp.register(account, password);

  if (!ret.ok) {
    await call.error(`Register failed: ${ret.error}`);
    return;
  }

  const res: ResRegister = {
    userId: ret.data.userId,
  };
  await call.succ(res);
}