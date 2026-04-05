import { ApiCall } from "tsrpc";
import {
  ReqLogin,
  ResLogin,
} from "../protocols/PtlLogin";
import { ServiceType } from "../protocols/serviceProto";
import { ComponentManager } from "../../../common/BaseComponent";
import type { PlayerComponent } from "../../../component/PlayerComponent";

export async function ApiLogin(
  call: ApiCall<ReqLogin, ResLogin, ServiceType>,
) {
  const { account, password } = call.req;

  const playerComp =
    ComponentManager.instance.getComponentByKey<PlayerComponent>(
      "PlayerComponent",
    );

  if (!playerComp) {
    await call.error("Login failed: PlayerComponentNotInitialized");
    return;
  }

  const ret = await playerComp.login(account, password);

  if (!ret.ok) {
    await call.error(`Login failed: ${ret.error}`);
    return;
  }

  const res: ResLogin = {
    userId: ret.data.userId,
    hasRole: !!ret.data.nickname,
  };
  await call.succ(res);
}
