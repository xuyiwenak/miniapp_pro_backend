// src/shared/public/instance/front_protocols/PtlCreateRole.ts
export interface ReqCreateRole {
    userId: string;
    nickname: string;
  }
  
  export interface ResCreateRole {
    roleId: string;
  }