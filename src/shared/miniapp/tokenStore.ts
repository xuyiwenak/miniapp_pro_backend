import { randomBytes } from 'crypto';
import { saveTokenUserId } from '../../auth/RedisTokenStore';

export function createToken(): string {
  return randomBytes(24).toString('hex');
}

export async function issueToken(userId: string, ttlSeconds?: number): Promise<string> {
  const token = createToken();
  await saveTokenUserId(token, userId, ttlSeconds);
  return token;
}
