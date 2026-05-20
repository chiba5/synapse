import { spawnSync } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const SYNAPSE_URL = process.env.SYNAPSE_URL ?? 'http://localhost:3000';
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? '';
const SANDBOX_BASE = process.env.SANDBOX_BASE ?? join(homedir(), 'work', 'sandbox', 'try-jobs');
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? '60000', 10);

type PendingJob = {
  id: string;
  feed_item_id: string;
  feed_items: {
    id: string;
    title: string;
    summary: string | null;
    source_url: string | null;
  } | null;
};

async function fetchPendingJobs(): Promise<PendingJob[]> {
  const res = await fetch(`${SYNAPSE_URL}/api/jobs/pending`, {
    headers: { 'X-Agent-Token': AGENT_TOKEN },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { jobs: PendingJob[] };
  return json.jobs ?? [];
}

async function completeJob(
  id: string,
  status: 'done' | 'failed',
  resultSummary?: string,
  resultUrl?: string
) {
  await fetch(`${SYNAPSE_URL}/api/jobs/${id}/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Token': AGENT_TOKEN,
    },
    body: JSON.stringify({ status, result_summary: resultSummary, result_url: resultUrl }),
  });
}

function buildPrompt(job: PendingJob): string {
  const item = job.feed_items;
  if (!item) return '';
  return (
    `以下のAI技術ニュースについて、実際に動くコードを書いて試してください。\n\n` +
    `タイトル: ${item.title}\n` +
    `概要: ${item.summary ?? 'N/A'}\n` +
    `URL: ${item.source_url ?? 'N/A'}\n\n` +
    `手順:\n` +
    `1. 関連ライブラリを npm/pip でインストール（必要な場合）\n` +
    `2. サンプルコードを作成して実行\n` +
    `3. 結果を Markdown でまとめる（試した内容・出力・気づき）\n\n` +
    `作業が完了したら最後の行に次の形式で結果のサマリを出力してください:\n` +
    `RESULT: <1行でサマリ>`
  );
}

async function processJob(job: PendingJob) {
  const item = job.feed_items;
  if (!item) {
    await completeJob(job.id, 'failed', 'feed_item not found');
    return;
  }

  console.log(`  [job] ${job.id.slice(0, 8)}… "${item.title.slice(0, 50)}"`);

  const workDir = join(SANDBOX_BASE, `job-${job.id.slice(0, 8)}`);
  if (!existsSync(workDir)) mkdirSync(workDir, { recursive: true });

  const prompt = buildPrompt(job);
  if (!prompt) {
    await completeJob(job.id, 'failed', 'could not build prompt');
    return;
  }

  const result = spawnSync('claude', ['-p', prompt], {
    cwd: workDir,
    shell: true,
    encoding: 'utf-8',
    timeout: 120_000,
  });

  if (result.error || result.status !== 0) {
    const msg = result.stderr?.slice(0, 300) ?? String(result.error);
    console.warn(`  [job] failed:`, msg);
    await completeJob(job.id, 'failed', msg);
    return;
  }

  const output = result.stdout ?? '';
  const resultMatch = output.match(/RESULT:\s*(.+)$/m);
  const summary = resultMatch ? resultMatch[1].trim() : output.slice(-200).trim();

  await completeJob(job.id, 'done', summary, workDir);
  console.log(`  [job] done: ${summary.slice(0, 80)}`);
}

export async function runPollJobs() {
  console.log(`[poll-jobs] Starting — interval=${POLL_INTERVAL_MS}ms`);
  console.log(`[poll-jobs] Sandbox base: ${SANDBOX_BASE}`);

  while (true) {
    try {
      const jobs = await fetchPendingJobs();
      if (jobs.length > 0) {
        console.log(`[poll-jobs] ${jobs.length} pending job(s)`);
        for (const job of jobs) {
          await processJob(job);
        }
      }
    } catch (e) {
      console.warn('[poll-jobs] Error:', String(e));
    }

    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}
