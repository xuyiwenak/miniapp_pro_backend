import type { DBCfg } from "../common/CommonType";

/** Docker Compose 中 Mongo 服务名为 mongo；带 root 账号时需 authSource=admin */
export function buildMongoUrl(dbConfig: DBCfg): string {
  const { host, port, db, user, password, authSource } = dbConfig;
  let auth = "";
  if (user !== undefined && password !== undefined) {
    auth = `${encodeURIComponent(user)}:${encodeURIComponent(password)}@`;
  } else if (user !== undefined) {
    auth = `${encodeURIComponent(user)}@`;
  }
  const base = `mongodb://${auth}${host}:${port}/${db}`;
  if (user !== undefined && password !== undefined) {
    const src = authSource ?? "admin";
    return `${base}?authSource=${encodeURIComponent(src)}`;
  }
  return base;
}
