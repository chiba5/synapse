import { createClient } from '@supabase/supabase-js';
import { getRequestContext } from '@cloudflare/next-on-pages';

function getEnv(key: string): string | undefined {
  try {
    // CF Pages runtime (production) + local dev via setupDevPlatform()
    const env = getRequestContext().env as Record<string, string>;
    return env[key];
  } catch {
    // Node.js fallback (npm run dev without wrangler)
    return process.env[key];
  }
}

export function getServiceClient() {
  const url = getEnv('SUPABASE_URL');
  const key = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase env vars not set');
  return createClient(url, key, { auth: { persistSession: false } });
}
