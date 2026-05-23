import { spawnSync } from 'child_process';
import { XMLParser } from 'fast-xml-parser';
import { RSS_SOURCES, GITHUB_SOURCES, X_QUERIES } from './sources.js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY ?? '';
const HOURS_BACK = parseInt(process.env.HOURS_BACK ?? '24', 10);
const ENABLE_X_SEARCH = process.env.ENABLE_X_SEARCH === 'true';

type IngestItem = {
  source: 'rss' | 'web_search' | 'x';
  source_url?: string;
  title: string;
  body?: string;
};

type Classification = {
  summary: string;
  category: 'practical' | 'knowledge' | 'claude_runnable';
  claude_runnable: boolean;
};

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

function cutoffMs(): number {
  return Date.now() - HOURS_BACK * 60 * 60 * 1000;
}

async function fetchRss(url: string): Promise<IngestItem[]> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'synapse-agent/0.1' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const doc = xmlParser.parse(xml);
  const cutoff = cutoffMs();

  if (doc.rss?.channel?.item) {
    const raw = doc.rss.channel.item;
    const items: unknown[] = Array.isArray(raw) ? raw : [raw];
    return items
      .filter(i => {
        const it = i as Record<string, unknown>;
        const d = new Date(String(it.pubDate ?? it.updated ?? 0)).getTime();
        return !d || d >= cutoff;
      })
      .map(i => {
        const it = i as Record<string, unknown>;
        return {
          source: 'rss' as const,
          source_url: String(it.link ?? it.guid ?? ''),
          title: String(it.title ?? ''),
          body: String(it.description ?? it.summary ?? '').slice(0, 500),
        };
      });
  }

  if (doc.feed?.entry) {
    const raw = doc.feed.entry;
    const entries: unknown[] = Array.isArray(raw) ? raw : [raw];
    return entries
      .filter(e => {
        const en = e as Record<string, unknown>;
        const d = new Date(String(en.updated ?? en.published ?? 0)).getTime();
        return !d || d >= cutoff;
      })
      .map(e => {
        const en = e as Record<string, unknown>;
        const linkEl = en.link;
        let href = '';
        if (Array.isArray(linkEl)) {
          const alt = (linkEl as Record<string, unknown>[]).find(l => l['@_rel'] === 'alternate');
          href = String(alt?.['@_href'] ?? (linkEl[0] as Record<string, unknown>)?.['@_href'] ?? '');
        } else if (linkEl && typeof linkEl === 'object') {
          href = String((linkEl as Record<string, unknown>)['@_href'] ?? '');
        } else {
          href = String(linkEl ?? '');
        }
        const titleEl = en.title;
        const titleText = titleEl && typeof titleEl === 'object'
          ? String((titleEl as Record<string, unknown>)['#text'] ?? '')
          : String(titleEl ?? '');
        return {
          source: 'rss' as const,
          source_url: href,
          title: titleText,
          body: String(en.summary ?? en.content ?? '').slice(0, 500),
        };
      });
  }

  return [];
}

async function fetchGithub(url: string): Promise<IngestItem[]> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'synapse-agent/0.1',
      'Accept': 'application/vnd.github.v3+json',
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const releases = (await res.json()) as Array<{
    name: string; body: string; published_at: string; html_url: string;
  }>;
  const cutoff = cutoffMs();
  return releases
    .filter(r => new Date(r.published_at).getTime() >= cutoff)
    .map(r => ({
      source: 'rss' as const,
      source_url: r.html_url,
      title: r.name,
      body: (r.body ?? '').slice(0, 500),
    }));
}

function searchX(query: string): IngestItem[] {
  const prompt =
    `hermes-x-search ツールで次のクエリを検索し、JSONのみ返してください（説明不要）。\n` +
    `クエリ: ${query}\n\n` +
    `返却形式: [{"title":"タイトル","url":"https://...","snippet":"概要"}]\n` +
    `結果がなければ [] を返してください。`;

  const result = spawnSync('claude', ['-p', prompt], {
    shell: true,
    encoding: 'utf-8',
    timeout: 30_000,
  });

  if (result.error || result.status !== 0) {
    console.warn(`  [x] spawn error for "${query}":`, result.stderr?.slice(0, 200));
    return [];
  }

  try {
    const match = result.stdout.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]) as Array<{ title: string; url: string; snippet?: string }>;
    return parsed.map(p => ({
      source: 'x' as const,
      source_url: p.url,
      title: p.title,
      body: p.snippet,
    }));
  } catch {
    return [];
  }
}

async function classify(item: IngestItem): Promise<Classification> {
  const excerpt = (item.body ?? '').slice(0, 500);
  const prompt = `以下のAI・技術ニュース記事を2〜3文で日本語要約し、カテゴリを判定してください。

タイトル: ${item.title}
URL: ${item.source_url ?? 'N/A'}
本文（抜粋）: ${excerpt}

以下のJSONのみ返してください（他のテキスト不要）:
{"summary":"2〜3文の日本語要約","category":"practical|knowledge|claude_runnable","claude_runnable":true|false}

カテゴリ定義:
- practical: 実務・開発ですぐ使える（APIリリース、ツール公開など）
- claude_runnable: Claude Codeで今すぐ試せる実装例・コード・機能
- knowledge: 知識・トレンド・研究として知っておくべき内容`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    return { summary: item.title, category: 'knowledge', claude_runnable: false };
  }

  const data = await res.json() as { content: Array<{ type: string; text: string }> };
  const text = data.content?.[0]?.type === 'text' ? data.content[0].text : '';

  try {
    const parsed = JSON.parse(text);
    const validCategories = ['practical', 'knowledge', 'claude_runnable'];
    return {
      summary: String(parsed.summary ?? ''),
      category: (validCategories.includes(parsed.category) ? parsed.category : 'knowledge') as Classification['category'],
      claude_runnable: Boolean(parsed.claude_runnable),
    };
  } catch {
    return { summary: item.title, category: 'knowledge', claude_runnable: false };
  }
}

async function upsertItem(item: IngestItem, cl: Classification): Promise<'saved' | 'skipped' | 'error'> {
  const record = {
    source: item.source,
    source_url: item.source_url ?? null,
    title: item.title,
    body: item.body ?? null,
    summary: cl.summary,
    category: cl.category,
    claude_runnable: cl.claude_runnable,
  };

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/feed_items?on_conflict=source_url`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify(record),
      signal: AbortSignal.timeout(10_000),
    }
  );

  if (!res.ok) {
    console.warn(`  [db] upsert failed ${res.status}: ${await res.text()}`);
    return 'error';
  }
  // 201 = inserted, 200 = ignored duplicate
  return res.status === 201 ? 'saved' : 'skipped';
}

export async function runCollect() {
  console.log(`[collect] Starting — ${new Date().toISOString()}`);
  const all: IngestItem[] = [];

  for (const src of RSS_SOURCES) {
    try {
      const items = await fetchRss(src.url);
      console.log(`  [rss] ${src.name}: ${items.length} items`);
      all.push(...items);
    } catch (e) {
      console.warn(`  [rss] ${src.name} failed:`, String(e));
    }
  }

  for (const src of GITHUB_SOURCES) {
    try {
      const items = await fetchGithub(src.url);
      console.log(`  [github] ${src.name}: ${items.length} items`);
      all.push(...items);
    } catch (e) {
      console.warn(`  [github] ${src.name} failed:`, String(e));
    }
  }

  if (!ENABLE_X_SEARCH) {
    console.log('  [x] skipped (ENABLE_X_SEARCH=true で有効化)');
  }

  for (const query of ENABLE_X_SEARCH ? X_QUERIES : []) {
    try {
      const items = searchX(query);
      console.log(`  [x] "${query.slice(0, 40)}": ${items.length} items`);
      all.push(...items);
    } catch (e) {
      console.warn(`  [x] "${query}" failed:`, String(e));
    }
  }

  // URL 重複除去
  const seen = new Set<string>();
  const deduped = all.filter(item => {
    if (!item.source_url) return true;
    if (seen.has(item.source_url)) return false;
    seen.add(item.source_url);
    return true;
  });

  console.log(`[collect] ${all.length} raw → ${deduped.length} unique`);
  if (deduped.length === 0) { console.log('[collect] Nothing to ingest'); return; }

  let saved = 0, skipped = 0, failed = 0;
  for (const item of deduped) {
    try {
      const cl = await classify(item);
      const result = await upsertItem(item, cl);
      if (result === 'saved') saved++;
      else if (result === 'skipped') skipped++;
      else failed++;
    } catch (e) {
      console.warn(`  [error] "${item.title.slice(0, 40)}": ${String(e)}`);
      failed++;
    }
  }

  console.log(`[collect] Done — saved=${saved} skipped=${skipped} failed=${failed}`);
}
