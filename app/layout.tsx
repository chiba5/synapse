export const runtime = 'edge';

import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Nav from './_components/Nav';
import { isTimelogViewer } from '@/lib/timelog-auth';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Synapse',
  description: 'チバ+齋藤蓮の外部脳共有ワークスペース',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Synapse' },
};

export const viewport: Viewport = {
  themeColor: '#18181b',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const showTimelog = await isTimelogViewer().catch(() => false);
  return (
    <html lang="ja" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Nav showTimelog={showTimelog} />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
