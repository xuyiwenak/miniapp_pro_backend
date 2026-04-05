// src/shared/public/instance/front_protocols/PtlLogin.ts
export interface ReqLogin {
    account: string;
    password: string;
  }
  
  export interface ResLogin {
    userId: string;      // 内部玩家唯一 ID
    hasRole: boolean;    // 是否已经有角色
  }