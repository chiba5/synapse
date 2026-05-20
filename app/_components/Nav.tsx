'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Home' },
  { href: '/morning', label: 'Morning' },
  { href: '/daily-reports', label: '日報' },
  { href: '/notes', label: 'ノート' },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 flex items-center gap-6">
      <span className="text-sm font-bold text-zinc-900 dark:text-zinc-50 mr-2">Synapse</span>
      {links.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={`text-sm transition-colors ${
            pathname === href
              ? 'font-medium text-zinc-900 dark:text-zinc-50'
              : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
