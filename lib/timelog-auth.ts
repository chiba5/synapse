import { cookies, headers } from 'next/headers';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { isTimelogOwner } from './timelog';

function getEnv(key: string): string | undefined {
  try {
    const env = getRequestContext().env as Record<string, string>;
    return env[key] ?? process.env[key];
  } catch {
    return process.env[key];
  }
}

// レイアウトから毎回呼ぶので、鍵の取得は isolate 内で使い回す
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
function getJwks(teamDomain: string) {
  let jwks = jwksCache.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    jwksCache.set(teamDomain, jwks);
  }
  return jwks;
}

/**
 * CF Access の JWT を自分で検証してメールを取る。
 * x-user-email ヘッダーはクライアントが送れてしまうので、time-log の本人判定には使わない。
 */
async function getVerifiedEmail(): Promise<string | null> {
  if (process.env.NODE_ENV === 'development') {
    return process.env.DEV_USER_EMAIL ?? 'dev@example.com';
  }
  const hdrs = await headers();
  const token = hdrs.get('cf-access-jwt-assertion') || (await cookies()).get('CF_Authorization')?.value;
  const teamDomain = getEnv('TEAM_DOMAIN');
  const audience = getEnv('ACCESS_AUD');
  if (!token || !teamDomain || !audience) return null;
  try {
    const { payload } = await jwtVerify(token, getJwks(teamDomain), { audience });
    return typeof payload.email === 'string' ? payload.email : null;
  } catch {
    return null;
  }
}

/** 今のリクエストが time-log の持ち主（TIMELOG_OWNER_EMAIL）か。 */
export async function isTimelogViewer(): Promise<boolean> {
  const email = await getVerifiedEmail();
  return isTimelogOwner(email, getEnv('TIMELOG_OWNER_EMAIL'));
}
