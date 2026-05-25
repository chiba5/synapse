'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Brain } from 'lucide-react';

const links = [
  { href: '/chat', label: 'Chat' },
  { href: '/morning', label: 'Morning' },
  { href: '/daily-reports', label: '日報' },
  { href: '/notes', label: 'ノート' },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm px-4 h-12 flex items-center gap-1">
      <Link href="/" className="flex items-center gap-1.5 mr-4">
        <Brain className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold tracking-tight">Synapse</span>
      </Link>
      {links.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            'px-3 py-1.5 rounded-md text-sm transition-colors',
            pathname === href || pathname.startsWith(href + '/')
              ? 'bg-secondary text-secondary-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
