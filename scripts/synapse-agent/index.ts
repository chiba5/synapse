import 'dotenv/config';
import { runCollect } from './collect.js';
import { runPollJobs } from './poll-jobs.js';

const mode = process.argv.find(a => a.startsWith('--mode='))?.split('=')[1];

if (!mode) {
  console.error('Usage: tsx index.ts --mode=collect|poll-jobs');
  process.exit(1);
}

if (mode === 'collect') {
  await runCollect().catch(e => { console.error(e); process.exit(1); });
} else if (mode === 'poll-jobs') {
  await runPollJobs();
} else {
  console.error(`Unknown mode: ${mode}`);
  process.exit(1);
}
