declare module "uuid" {
  /** 生成一个 v4 UUID 字符串 */
  export function v4(): string;
}

declare module "cos-nodejs-sdk-v5" {
  interface CosOptions {
    SecretId: string;
    SecretKey: string;
  }
  interface PutObjectParams {
    Bucket: string;
    Region: string;
    Key: string;
    Body: Buffer;
    ContentType: string;
  }
  export default class COS {
    constructor(options: CosOptions);
    putObject(
      params: PutObjectParams,
      callback: (err: Error | null) => void,
    ): void;
  }
}

