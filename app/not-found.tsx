import Link from 'next/link';

// layout が本人判定で動的になったため、next-on-pages は /_not-found にも edge を求める
export const runtime = 'edge';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-2xl w-full px-4 py-16 text-center space-y-4">
      <h1 className="text-2xl font-semibold">ページが見つかりません</h1>
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">ホームへ</Link>
    </main>
  );
}
