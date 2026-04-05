
# TSRPC API 接口文档

## 通用说明

- 所有请求方法均为 `POST`
- 所有请求均需加入以下 Header :
    - `Content-Type: application/json`

## 目录

- [CreateRole](#/CreateRole)
- [EnterZone](#/EnterZone)
- [Login](#/Login)
- [Register](#/Register)

---

## CreateRole <a id="/CreateRole"></a>

**路径**
- POST `/CreateRole`

**请求**
```ts
interface ReqCreateRole {
    userId: string,
    nickname: string
}
```

**响应**
```ts
interface ResCreateRole {
    roleId: string
}
```

---

## EnterZone <a id="/EnterZone"></a>

**路径**
- POST `/EnterZone`

**请求**
```ts
interface ReqEnterZone {
    userId: string,
    zoneId: string
}
```

**响应**
```ts
interface ResEnterZone {
    zoneId: string,
    serverTime: number
}
```

---

## Login <a id="/Login"></a>

**路径**
- POST `/Login`

**请求**
```ts
interface ReqLogin {
    account: string,
    password: string
}
```

**响应**
```ts
interface ResLogin {
    userId: string,
    hasRole: boolean
}
```

---

## Register <a id="/Register"></a>

**路径**
- POST `/Register`

**请求**
```ts
interface ReqRegister {
    account: string,
    password: string
}
```

**响应**
```ts
interface ResRegister {
    userId: string
}
```

