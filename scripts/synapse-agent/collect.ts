import { spawnSync } from 'child_process';
import { XMLParser } from 'fast-xml-parser';
import { RSS_SOURCES, GITHUB_SOURCES, X_QUERIES } from './sources.js';

const SYNAPSE_URL = process.env.SYNAPSE_URL ?? 'http://localhost:3000';
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? '';
const HOURS_BACK = parseInt(process.env.HOURS_BACK ?? '24', 10);

type IngestItem = {
  source: 'rss' | 'web_search' | 'x';
  source_url?: string;
  title: string;
  body?: string;
};

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

function cutoffMs(): number {
  return Date.now() - HOURS_BACK * 60 * 60 * 1000;
}

// RSS 2.0 と Atom の両方に対応
async function fetchRss(url: string): Promise<IngestItem[]> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'synapse-agent/0.1' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const doc = xmlParser.parse(xml);
  const cutoff = cutoffMs();

  // RSS 2.0
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

  // Atom
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

// `claude -p` サブプロセスで hermes-x-search を使って X を検索
function searchX(query: string): IngestItem[] {
  const prompt =
    `hermes-x-search ツールで次のクエリを検索し、JSONのみ返してください（説明不要）。\n` +
    `クエリ: ${query}\n\n` +
    `返却形式: [{"title":"タイトル","url":"https://...","snippet":"概要"}]\n` +
    `結果がなければ [] を返してください。`;

  // Windows では shell:true が必要（claude.cmd を実行するため）
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

async function postIngest(items: IngestItem[]) {
  const res = await fetch(`${SYNAPSE_URL}/api/ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Token': AGENT_TOKEN,
    },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error(`ingest HTTP ${res.status}`);
  return (await res.json()) as { saved: number; failed: number };
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

  for (const query of X_QUERIES) {
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

  // 20 件ずつバッチ POST
  let totalSaved = 0, totalFailed = 0;
  for (let i = 0; i < deduped.length; i += 20) {
    const batch = deduped.slice(i, i + 20);
    const { saved, failed } = await postIngest(batch);
    totalSaved += saved; totalFailed += failed;
    console.log(`  [ingest] batch ${Math.floor(i/20)+1}: saved=${saved} failed=${failed}`);
  }
  console.log(`[collect] Done — saved=${totalSaved} failed=${totalFailed}`);
}
