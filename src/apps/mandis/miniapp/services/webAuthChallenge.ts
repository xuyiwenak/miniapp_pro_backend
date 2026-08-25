import { createHash, randomInt, timingSafeEqual } from 'crypto';
import {
  consumeExpiringValue,
  reserveExpiringKey,
  saveExpiringValue,
} from '../../../../auth/RedisTokenStore';
export { normalizeEmail } from './webAuthIdentity';

export type AuthChallengeChannel = 'email' | 'sms';

const CODE_TTL_SECONDS = 5 * 60;
const RESEND_TTL_SECONDS = 60;
const CODE_PATTERN = /^\d{6}$/;

function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function buildKey(
  channel: AuthChallengeChannel,
  purpose: string,
  destination: string,
  suffix: string
): string {
  return `web:auth:${channel}:${purpose}:${suffix}:${hashValue(destination)}`;
}

function buildIpKey(channel: AuthChallengeChannel, ip: string): string {
  return `web:auth:${channel}:ip:${hashValue(ip)}`;
}

export async function createAuthChallenge(
  channel: AuthChallengeChannel,
  purpose: string,
  destination: string,
  ip: string,
  sendCode: (code: string) => Promise<void>
): Promise<{ ok: true; expiresInSeconds: number } | { ok: false; retryLater: boolean }> {
  const destinationKey = buildKey(channel, purpose, destination, 'rate');
  const ipKey = buildIpKey(channel, ip);
  const [destinationReserved, ipReserved] = await Promise.all([
    reserveExpiringKey(destinationKey, RESEND_TTL_SECONDS),
    reserveExpiringKey(ipKey, RESEND_TTL_SECONDS),
  ]);
  if (!destinationReserved || !ipReserved) return { ok: false, retryLater: true };

  const code = String(randomInt(100000, 1000000));
  await sendCode(code);
  await saveExpiringValue(
    buildKey(channel, purpose, destination, 'code'),
    hashValue(code),
    CODE_TTL_SECONDS
  );
  return { ok: true, expiresInSeconds: CODE_TTL_SECONDS };
}

export async function consumeAuthChallenge(
  channel: AuthChallengeChannel,
  purpose: string,
  destination: string,
  code: string
): Promise<boolean> {
  if (!CODE_PATTERN.test(code)) return false;
  const expectedHash = await consumeExpiringValue(
    buildKey(channel, purpose, destination, 'code')
  );
  if (!expectedHash) return false;
  return timingSafeEqual(Buffer.from(expectedHash), Buffer.from(hashValue(code)));
}
