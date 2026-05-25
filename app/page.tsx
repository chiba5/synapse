import { getCurrentEmail } from '@/lib/user';
import { ensureProfile } from '@/lib/profiles';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Newspaper, BookOpen, Sun, MessageSquare } from 'lucide-react';

export const runtime = 'edge';

const quickLinks = [
  { href: '/chat', label: 'Chat', desc: '蓮とメッセージ', icon: MessageSquare },
  { href: '/morning', label: 'Morning Feed', desc: 'AI ニュースを確認', icon: Sun },
  { href: '/daily-reports', label: '日報', desc: '今日の進捗を記録', icon: Newspaper },
  { href: '/notes', label: 'ノート', desc: 'アイデアをメモ', icon: BookOpen },
];

export default async function Home() {
  const email = await getCurrentEmail().catch(() => null);
  if (email) await ensureProfile(email).catch(() => null);
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold tracking-tight">Synapse</h1>
        <p className="text-muted-foreground">外部脳共有ワークスペース</p>
        {email && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{email.split('@')[0]}</span> としてログイン中
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full max-w-2xl">
        {quickLinks.map(({ href, label, desc, icon: Icon }) => (
          <Button key={href} variant="outline" className="h-auto p-0" asChild>
            <Link href={href}>
              <Card className="w-full border-0 shadow-none hover:bg-secondary/60 transition-colors">
                <CardContent className="pt-4 flex flex-col items-center gap-2 text-center">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </Button>
        ))}
      </div>
    </main>
  );
}
