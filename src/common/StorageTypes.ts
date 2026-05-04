/** 内部 Storage 组件接口，含函数成员，不可用于 TSRPC 协议层 */
export interface IStorage {
  valueMapMem: Map<string, unknown>;
  valueMapMemExt?: Map<string, unknown>;
  sName: string;
  setPlayerInfoById: (...args: unknown[]) => unknown;
  saveValueByPlayerId: (...args: unknown[]) => unknown;
  getValueByPlayerId: (...args: unknown[]) => unknown;
}
