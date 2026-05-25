import { getCurrentEmail } from '@/lib/user';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(req: Request) {
  const email = await getCurrentEmail().catch(() => null);
  if (!email) return new Response('Unauthorized', { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return new Response('file required', { status: 400 });
  if (file.size > MAX_SIZE) return new Response('File too large (max 10 MB)', { status: 413 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = getRequestContext().env as Record<string, any>;
  const bucket = env['FILES_BUCKET'] as {
    put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }): Promise<void>;
  } | undefined;

  if (!bucket) return new Response('R2 not configured', { status: 503 });

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `chat/${Date.now()}-${safeName}`;

  await bucket.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || 'application/octet-stream' },
  });

  // R2_PUBLIC_URL: CF Pages 環境変数に設定（バケットを公開後）
  // 例: https://pub-<hash>.r2.dev または CF Workers カスタムドメイン
  const baseUrl = (env['R2_PUBLIC_URL'] as string | undefined)?.replace(/\/$/, '') ?? '';
  const fileUrl = baseUrl ? `${baseUrl}/${key}` : key;

  return Response.json({
    file_url: fileUrl,
    file_name: file.name,
    file_size: file.size,
    file_mime_type: file.type,
  });
}
