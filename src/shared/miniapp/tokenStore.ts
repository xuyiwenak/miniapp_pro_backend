import { randomBytes } from "crypto";
import { saveTokenUserId } from "../../auth/RedisTokenStore";

export function createToken(): string {
  return randomBytes(24).toString("hex");
}

export async function issueToken(userId: string): Promise<string> {
  const token = createToken();
  await saveTokenUserId(token, userId);
  return token;
}
