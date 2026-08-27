import { strict as assert } from 'assert';
import type { Request } from 'express';
import type { Response } from 'express';
import {
  readWebSessionToken,
  setWebSessionCookie,
  WEB_SESSION_COOKIE_NAME,
} from '../../src/shared/miniapp/webSession';

describe('webSession', () => {
  it('reads the opaque session token without exposing unrelated cookies', () => {
    const token = 'a'.repeat(48);
    const request = {
      headers: {
        cookie: `theme=light; ${WEB_SESSION_COOKIE_NAME}=${token}; locale=zh-CN`,
      },
    } as Request;

    assert.equal(readWebSessionToken(request), token);
  });

  it('returns undefined when the session cookie is absent', () => {
    const request = { headers: { cookie: 'theme=light' } } as Request;
    assert.equal(readWebSessionToken(request), undefined);
  });

  it('sets hardened persistent cookie attributes in production', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    let options: Record<string, unknown> | undefined;
    const response = {
      cookie: (_name: string, _value: string, cookieOptions: Record<string, unknown>) => {
        options = cookieOptions;
      },
    } as unknown as Response;

    setWebSessionCookie(response, 'a'.repeat(48));
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;

    assert.equal(options?.httpOnly, true);
    assert.equal(options?.secure, true);
    assert.equal(options?.sameSite, 'lax');
    assert.equal(options?.path, '/api');
    assert.equal(options?.maxAge, 30 * 24 * 60 * 60 * 1000);
  });
});
