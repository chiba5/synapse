import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
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
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
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

async function fetchMessages(channelId: string, since: string | undefined): Promise<MessageRow[]> {
  const params = new URLSearchParams({
    select: 'id,body,file_name,file_url,created_at,profiles!messages_sender_id_fkey(email)',
    channel_id: `eq.${channelId}`,
    order: 'created_at.asc',
  });
  if (since) params.set('created_at', `gt.${since}`);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/messages?${params.toString()}`, {
    headers: sbHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`messages HTTP ${res.status}`);
  return (await res.json()) as MessageRow[];
}

function renderMessage(m: MessageRow): string {
  const who = m.profiles?.email?.split('@')[0] ?? 'unknown';
  const lines: string[] = [`**${jstTime(m.created_at)} · ${who}**`, ''];
  if (m.body) lines.push(m.body, '');
  if (m.file_url) lines.push(`📎 [${m.file_name ?? 'ファイル'}](${m.file_url})`, '');
  return lines.join('\n');
}

// Append messages to vault/synapse-chat/<channel>/YYYY-MM.md, grouped by JST day.
function appendToVault(channelName: string, messages: MessageRow[]) {
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

  for (const [month, msgs] of byMonth) {
    const file = join(channelDir, `${month}.md`);
    const existing = existsSync(file) ? readFileSync(file, 'utf-8') : '';
    let out = '';
    if (!existing) out += `# synapse chat — #${channelName} — ${month}\n`;
    const seenDays = new Set<string>();
    // pre-seed seenDays from existing content so we don't repeat day headers
    for (const m of msgs) {
      const day = jstDay(m.created_at);
      const header = `## ${day}`;
      if (!seenDays.has(day) && !existing.includes(header) && !out.includes(header)) {
        out += `\n${header}\n\n`;
      }
      seenDays.add(day);
      out += renderMessage(m) + '\n';
    }
    if (existing) appendFileSync(file, out, 'utf-8');
    else writeFileSync(file, out, 'utf-8');
  }
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
  for (const ch of channels) {
    try {
      const since = state[ch.id];
      const messages = await fetchMessages(ch.id, since);
      if (messages.length === 0) {
        console.log(`  [${ch.name}] no new messages`);
        continue;
      }
      appendToVault(ch.name, messages);
      state[ch.id] = messages[messages.length - 1].created_at;
      totalNew += messages.length;
      console.log(`  [${ch.name}] archived ${messages.length} message(s)`);
    } catch (e) {
      console.warn(`  [${ch.name}] failed:`, String(e));
    }
  }

  // persist marker even if some channels failed (successful ones advanced)
  saveState(state);
  console.log(`[archive-chat] Done — ${totalNew} new message(s) across ${channels.length} channel(s)`);
}
