import { checkServiceToken } from '@/lib/service-auth';
import { getServiceClient } from '@/lib/supabase';
import { classifyFeedItem } from '@/lib/anthropic';

export const runtime = 'edge';

type IngestItem = {
  source: 'x' | 'rss' | 'web_search';
  source_url?: string;
  title: string;
  body?: string;
};

export async function POST(req: Request) {
  if (!checkServiceToken(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await req.json().catch(() => null) as { items?: IngestItem[] } | null;
  if (!payload?.items?.length) {
    return Response.json({ error: 'items array is required' }, { status: 400 });
  }

  const db = getServiceClient();
  let saved = 0;
  let failed = 0;

  for (const item of payload.items) {
    try {
      const classification = await classifyFeedItem({
        title: item.title,
        body: item.body,
        source_url: item.source_url,
      });

      const { error } = await db.from('feed_items').upsert(
        {
          source: item.source,
          source_url: item.source_url ?? null,
          title: item.title,
          body: item.body ?? null,
          summary: classification.summary,
          category: classification.category,
          claude_runnable: classification.claude_runnable,
        },
        { onConflict: 'source_url', ignoreDuplicates: true }
      );

      if (error) { failed++; } else { saved++; }
    } catch {
      failed++;
    }
  }

  return Response.json({ saved, failed });
}
