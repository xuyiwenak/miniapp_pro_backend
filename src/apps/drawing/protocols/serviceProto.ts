import { ServiceProto } from 'tsrpc-proto';
import { MsgPing } from './MsgPing';
import { MsgUserNotice } from './MsgUserNotice';
import { ReqCreateRole, ResCreateRole } from './PtlCreateRole';
import { ReqEnterZone, ResEnterZone } from './PtlEnterZone';
import { ReqLogin, ResLogin } from './PtlLogin';
import { ReqRegister, ResRegister } from './PtlRegister';

export interface ServiceType {
    api: {
        "CreateRole": {
            req: ReqCreateRole,
            res: ResCreateRole
        },
        "EnterZone": {
            req: ReqEnterZone,
            res: ResEnterZone
        },
        "Login": {
            req: ReqLogin,
            res: ResLogin
        },
        "Register": {
            req: ReqRegister,
            res: ResRegister
        }
    },
    msg: {
        "Ping": MsgPing,
        "UserNotice": MsgUserNotice
    }
}

export const serviceProto: ServiceProto<ServiceType> = {
    "version": 4,
    "services": [
        {
            "id": 0,
            "name": "Ping",
            "type": "msg"
        },
        {
            "id": 1,
            "name": "UserNotice",
            "type": "msg"
        },
        {
            "id": 2,
            "name": "CreateRole",
            "type": "api"
        },
        {
            "id": 3,
            "name": "EnterZone",
            "type": "api"
        },
        {
            "id": 4,
            "name": "Login",
            "type": "api"
        },
        {
            "id": 5,
            "name": "Register",
            "type": "api"
        }
    ],
    "types": {
        "MsgPing/MsgPing": {
            "type": "Interface"
        },
        "MsgUserNotice/MsgUserNotice": {
            "type": "Interface",
            "properties": [
                {
                    "id": 0,
                    "name": "noticeType",
                    "type": {
                        "type": "Reference",
                        "target": "../../../shared/type/Type/eUserNotice"
                    }
                }
            ]
        },
        "../../../shared/type/Type/eUserNotice": {
            "type": "Enum",
            "members": [
                {
                    "id": 0,
                    "value": 0
                }
            ]
        },
        "PtlCreateRole/ReqCreateRole": {
            "type": "Interface",
            "properties": [
                {
                    "id": 0,
                    "name": "userId",
                    "type": {
                        "type": "String"
                    }
                },
                {
                    "id": 1,
                    "name": "nickname",
                    "type": {
                        "type": "String"
                    }
                }
            ]
        },
        "PtlCreateRole/ResCreateRole": {
            "type": "Interface",
            "properties": [
                {
                    "id": 0,
                    "name": "roleId",
                    "type": {
                        "type": "String"
                    }
                }
            ]
        },
        "PtlEnterZone/ReqEnterZone": {
            "type": "Interface",
            "properties": [
                {
                    "id": 0,
                    "name": "userId",
                    "type": {
                        "type": "String"
                    }
                },
                {
                    "id": 1,
                    "name": "zoneId",
                    "type": {
                        "type": "String"
                    }
                }
            ]
        },
        "PtlEnterZone/ResEnterZone": {
            "type": "Interface",
            "properties": [
                {
                    "id": 0,
                    "name": "zoneId",
                    "type": {
                        "type": "String"
                    }
                },
                {
                    "id": 1,
                    "name": "serverTime",
                    "type": {
                        "type": "Number"
                    }
                }
            ]
        },
        "PtlLogin/ReqLogin": {
            "type": "Interface",
            "properties": [
                {
                    "id": 0,
                    "name": "account",
                    "type": {
                        "type": "String"
                    }
                },
                {
                    "id": 1,
                    "name": "password",
                    "type": {
                        "type": "String"
                    }
                }
            ]
        },
        "PtlLogin/ResLogin": {
            "type": "Interface",
            "properties": [
                {
                    "id": 0,
                    "name": "userId",
                    "type": {
                        "type": "String"
                    }
                },
                {
                    "id": 1,
                    "name": "hasRole",
                    "type": {
                        "type": "Boolean"
                    }
                }
            ]
        },
        "PtlRegister/ReqRegister": {
            "type": "Interface",
            "properties": [
                {
                    "id": 0,
                    "name": "account",
                    "type": {
                        "type": "String"
                    }
                },
                {
                    "id": 1,
                    "name": "password",
                    "type": {
                        "type": "String"
                    }
                }
            ]
        },
        "PtlRegister/ResRegister": {
            "type": "Interface",
            "properties": [
                {
                    "id": 0,
                    "name": "userId",
                    "type": {
                        "type": "String"
                    }
                }
            ]
        }
    }
};