import { config } from 'dotenv';
config({ override: true });

const mode = process.argv.find(a => a.startsWith('--mode='))?.split('=')[1];

if (!mode) {
  console.error('Usage: tsx index.ts --mode=collect|poll-jobs');
  process.exit(1);
}

if (mode === 'collect') {
  const { runCollect } = await import('./collect.js');
  await runCollect().catch(e => { console.error(e); process.exit(1); });
} else if (mode === 'poll-jobs') {
  const { runPollJobs } = await import('./poll-jobs.js');
  await runPollJobs();
} else {
  console.error(`Unknown mode: ${mode}`);
  process.exit(1);
}
