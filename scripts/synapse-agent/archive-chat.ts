import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, renameSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const AGENT_DIR = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
// vault location: VAULT_DIR override, else <userprofile>/vault
const VAULT_DIR =
  process.env.VAULT_DIR ?? resolve(process.env.USERPROFILE ?? process.env.HOME ?? '.', 'vault');
const ARCHIVE_DIR = join(VAULT_DIR, 'synapse-chat');
const STATE_FILE = join(AGENT_DIR, 'archive-state.json');

type ChannelRow = { id: string; name: string };
type MessageRow = {
  id: string;
  body: string | null;
  file_name: string | null;
  file_url: string | null;
  created_at: string;
  profiles: { email: string } | null;
};
type State = Record<string, string>; // channel_id -> last archived created_at (UTC ISO)

const JST = 'Asia/Tokyo';

function sbHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };
}

function loadState(): State {
  try {
    if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, 'utf-8')) as State;
  } catch (e) {
    console.warn('  [state] read failed, starting fresh:', String(e));
  }
  return {};
}

function saveState(state: State) {
  // atomic write: tmp then rename, so a crash mid-write can't corrupt state
  // (a corrupt state would fall back to {} and re-archive everything).
  const tmp = STATE_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf-8');
  renameSync(tmp, STATE_FILE);
}

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'channel';
}

function jstDay(iso: string): string {
  // YYYY-MM-DD in JST (sv-SE locale yields ISO-like date)
  return new Date(iso).toLocaleDateString('sv-SE', { timeZone: JST });
}

function jstTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ja-JP', { timeZone: JST, hour: '2-digit', minute: '2-digit' });
}

async function fetchChannels(): Promise<ChannelRow[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/channels?select=id,name&order=created_at.asc`, {
    headers: sbHeaders(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`channels HTTP ${res.status}`);
  return (await res.json()) as ChannelRow[];
}

const PAGE_LIMIT = 1000;

async function fetchMessages(channelId: string, since: string | undefined): Promise<MessageRow[]> {
  const params = new URLSearchParams({
    select: 'id,body,file_name,file_url,created_at,profiles!messages_sender_id_fkey(email)',
    channel_id: `eq.${channelId}`,
    order: 'created_at.asc',
    limit: String(PAGE_LIMIT),
  });
  // gte (not gt) so a message sharing the marker's exact timestamp isn't
  // skipped; the re-fetched boundary message is removed later by id-dedup.
  if (since) params.set('created_at', `gte.${since}`);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/messages?${params.toString()}`, {
    headers: sbHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`messages HTTP ${res.status}`);
  const rows = (await res.json()) as MessageRow[];
  if (rows.length === PAGE_LIMIT) {
    console.warn(`  [${channelId}] hit ${PAGE_LIMIT}-row page limit; remainder will be archived on the next run`);
  }
  return rows;
}

function renderMessage(m: MessageRow): string {
  const who = m.profiles?.email?.split('@')[0] ?? 'unknown';
  const lines: string[] = [`**${jstTime(m.created_at)} · ${who}**`, ''];
  if (m.body) lines.push(m.body, '');
  if (m.file_url) lines.push(`📎 [${m.file_name ?? 'ファイル'}](${m.file_url})`, '');
  // invisible marker so reruns can skip already-archived messages even if the
  // state file is lost/corrupt or a previous run crashed mid-write.
  lines.push(`<!-- mid:${m.id} -->`, '');
  return lines.join('\n');
}

function archivedIds(content: string): Set<string> {
  const ids = new Set<string>();
  const re = /<!-- mid:([0-9a-fA-F-]+) -->/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) ids.add(m[1]);
  return ids;
}

function hasDayHeader(content: string, header: string): boolean {
  // line-exact match (substring includes() would collide on prefixes like
  // "## 2026-05-1" inside "## 2026-05-10", or on message bodies)
  return content.split('\n').some(line => line.trim() === header);
}

// Append messages to vault/synapse-chat/<channel>/YYYY-MM.md, grouped by JST
// day. Returns the number of messages actually written (after id-dedup).
function appendToVault(channelName: string, messages: MessageRow[]): number {
  const channelDir = join(ARCHIVE_DIR, safeName(channelName));
  if (!existsSync(channelDir)) mkdirSync(channelDir, { recursive: true });

  // group by month file, then by day
  const byMonth = new Map<string, MessageRow[]>();
  for (const m of messages) {
    const month = jstDay(m.created_at).slice(0, 7); // YYYY-MM
    const arr = byMonth.get(month) ?? [];
    arr.push(m);
    byMonth.set(month, arr);
  }

  let written = 0;
  for (const [month, msgs] of byMonth) {
    const file = join(channelDir, `${month}.md`);
    const existing = existsSync(file) ? readFileSync(file, 'utf-8') : '';
    const already = archivedIds(existing);
    const fresh = msgs.filter(m => !already.has(m.id));
    if (fresh.length === 0) continue;

    let out = '';
    if (!existing) out += `# synapse chat — #${channelName} — ${month}\n`;
    for (const m of fresh) {
      const header = `## ${jstDay(m.created_at)}`;
      if (!hasDayHeader(existing, header) && !hasDayHeader(out, header)) {
        out += `\n${header}\n\n`;
      }
      out += renderMessage(m) + '\n';
    }
    if (existing) appendFileSync(file, out, 'utf-8');
    else writeFileSync(file, out, 'utf-8');
    written += fresh.length;
  }
  return written;
}

export async function runArchiveChat() {
  console.log(`[archive-chat] Starting — ${new Date().toISOString()}`);
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('[archive-chat] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing');
    process.exit(1);
  }

  if (!existsSync(ARCHIVE_DIR)) mkdirSync(ARCHIVE_DIR, { recursive: true });
  const state = loadState();

  let channels: ChannelRow[];
  try {
    channels = await fetchChannels();
  } catch (e) {
    console.error('[archive-chat] failed to fetch channels:', String(e));
    process.exit(1);
  }

  let totalNew = 0;
  let failed = 0;
  for (const ch of channels) {
    try {
      const since = state[ch.id];
      const messages = await fetchMessages(ch.id, since);
      if (messages.length === 0) {
        console.log(`  [${ch.name}] no new messages`);
        continue;
      }
      const written = appendToVault(ch.name, messages);
      // advance the marker to the newest fetched message regardless of dedup,
      // so the next run's gte window stays tight
      state[ch.id] = messages[messages.length - 1].created_at;
      totalNew += written;
      console.log(`  [${ch.name}] archived ${written} new message(s) (${messages.length} fetched)`);
    } catch (e) {
      failed++;
      console.warn(`  [${ch.name}] failed:`, String(e));
    }
  }

  // persist marker even if some channels failed (successful ones advanced)
  saveState(state);
  console.log(`[archive-chat] Done — ${totalNew} new message(s), ${failed} channel(s) failed of ${channels.length}`);

  // surface total failure to Task Scheduler via a non-zero exit code
  if (failed > 0 && failed === channels.length) {
    console.error('[archive-chat] all channels failed');
    process.exit(1);
  }
}
