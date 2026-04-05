// src/shared/public/instance/front_protocols/PtlCreateRole.ts
export interface ReqRegister {
    account: string;
    password: string;
  }
  
  export interface ResRegister {
    userId: string;      // 内部玩家唯一 ID
  }