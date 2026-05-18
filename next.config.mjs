import { setupDevPlatform } from '@cloudflare/next-on-pages/next-dev';
import withSerwistInit from '@serwist/next';

if (process.env.NODE_ENV === 'development') {
  // fire-and-forget: Windows では await すると hang することがある
  setupDevPlatform().catch(() => {});
}

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  additionalPrecacheEntries: [{ url: '/offline', revision: null }],
  reloadOnOnline: true,
  cacheOnNavigation: true,
  disable: process.env.NODE_ENV === 'development',
});

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default withSerwist(nextConfig);
