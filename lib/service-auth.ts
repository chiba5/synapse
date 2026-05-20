import { getRequestContext } from '@cloudflare/next-on-pages';

function getEnv(key: string): string | undefined {
  try {
    const env = getRequestContext().env as Record<string, string>;
    return env[key];
  } catch {
    return process.env[key];
  }
}

export function checkServiceToken(request: Request): boolean {
  const token = request.headers.get('X-Agent-Token');
  const expectedToken = getEnv('AGENT_TOKEN');
  if (!token || !expectedToken) return false;
  return token === expectedToken;
}
