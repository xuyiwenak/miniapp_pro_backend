// src/shared/public/instance/front_protocols/PtlEnterZone.ts
export interface ReqEnterZone {
    userId: string;
    zoneId: string;   // 区 ID，和 SysCfgComponent 里的 zone 配置对应
  }
  
  export interface ResEnterZone {
    zoneId: string;
    serverTime: number;
  }