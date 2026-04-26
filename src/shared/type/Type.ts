/*
 * @Author: lyh
 * @Github:
 * @FilePath: /InstanceServer/src/shared/type/Type.ts
 * @Date: 2024-10-28 10:10:14
 * @LastEditors: lyh
 * @LastEditTime: 2025-01-15 16:00:16
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type TGameInfo = {
  id: string;
  publicUrl: string;
  internalUrl: string;
  gameType: string;
  version: number;
  zoneList: string[];
  status: TstatusString;
  group?: string;
  userNum?: number[];
  stamp?: number;
};

export type TstatusString = 'normal' | 'maintenance' | 'closing';

/* eslint-disable @typescript-eslint/no-unsafe-function-type */
export interface IStorage {
  valueMapMem: Map<string, any>;
  valueMapMemExt?: Map<string, any>;
  sName: string;
  setPlayerInfoById: Function;
  saveValueByPlayerId: Function;
  getValueByPlayerId: Function;
}
export type ResultWithError<T> =
  | [BadCode.Ok, T]
  | [Exclude<BadCode, BadCode.Ok>, undefined];
export type BadCodeWithoutOk = Exclude<BadCode, BadCode.Ok>;
export enum BadCode {
  Ok = 200,
  RPCClientNotExit = 400,
  ServerErr = 500,
  NOData = 501,
  LoginFirst = 503,
  TooBusy = 504,
  RegisterTokenInValid = 505,
  LoginInfoInValid = 506,
  Account_EmailDuplicate = 507,
  Account_EmailAddrInValid = 508,
  Account_EmailSendCodeInvalid = 509,
  AuthError = 550,
  ServerAuthError = 551,
  AuthTokenError = 552,
  ServerGameConfigError = 553,
}

export function badCodeToMsg(code: BadCode) {
  switch (code) {
    case BadCode.Ok:
      return 'OK';
    case BadCode.ServerErr:
      return 'Server Inner Error';
    default:
      return BadCode[code];
  }
}

/*------------------------------register begin--------------------------------------------------*/

export enum eAccountType {
  normal = 0,
  visit,
  test,
}
export enum eEmailSendCodeType {
  Register = 'Register',
}
/*-----------------------------register end---------------------------------------------------*/

/*--------------------------------------instance begin----------------------------------------------------*/
export enum eUserNotice {
  Mail = 0,
}

export interface UserInfo {
  uid: number;
  zone: string;
  name?: string;
  visualId?: number;
  gender?: number;
  introduction?: string;
}

export interface PlayerBasicInfo {
  playerId: number;
  nickName: string;
}

export interface ChatMessage extends PlayerBasicInfo {
  message: string;
  stamp: number;
}

export interface FriendRequest extends PlayerBasicInfo {
  stamp: number;
}

export interface BaseRequest {
  token: string;
}

export interface BaseResponse {}

export interface BaseConf {}

/*--------------------------------------instance begin----------------------------------------------------*/
