export const runtime = 'edge';

export default function Offline() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold text-zinc-700 dark:text-zinc-300">オフライン</h1>
      <p className="text-zinc-500">ネット接続がありません。接続を確認してください。</p>
    </main>
  );
}
