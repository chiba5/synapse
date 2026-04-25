import { getCurrentEmail } from '@/lib/user';
import { ensureProfile } from '@/lib/profiles';

export const runtime = 'edge';

export default async function Home() {
  const email = await getCurrentEmail().catch(() => null);
  if (email) await ensureProfile(email).catch(() => null);
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Synapse</h1>
      <p className="text-zinc-500 dark:text-zinc-400">外部脳共有ワークスペース — Phase 0</p>
      {email && (
        <p className="text-sm text-zinc-400 dark:text-zinc-500">
          ログイン中: <span className="font-medium text-zinc-700 dark:text-zinc-300">{email}</span>
        </p>
      )}
    </main>
  );
}
