import type { Request, Response } from 'express';

export const WEB_SESSION_COOKIE_NAME = 'original-sense-session';
const DEFAULT_WEB_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const COOKIE_PATH = '/api';
const SESSION_TOKEN_PATTERN = /^[a-f0-9]{48}$/;

export function getWebSessionTtlSeconds(): number {
  const configured = Number(process.env.WEB_SESSION_TTL_SECONDS);
  return Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_WEB_SESSION_TTL_SECONDS;
}

export function readWebSessionToken(req: Request): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;
  const prefix = `${WEB_SESSION_COOKIE_NAME}=`;
  const entry = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (!entry) return undefined;
  const token = entry.slice(prefix.length);
  return SESSION_TOKEN_PATTERN.test(token) ? token : undefined;
}

export function setWebSessionCookie(res: Response, token: string): void {
  res.cookie(WEB_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    maxAge: getWebSessionTtlSeconds() * 1000,
    path: COOKIE_PATH,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

export function clearWebSessionCookie(res: Response): void {
  res.clearCookie(WEB_SESSION_COOKIE_NAME, {
    httpOnly: true,
    path: COOKIE_PATH,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}
