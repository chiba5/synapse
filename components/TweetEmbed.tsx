'use client';

import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    twttr?: {
      widgets: {
        createTweet: (
          id: string,
          el: HTMLElement,
          opts?: Record<string, unknown>
        ) => Promise<HTMLElement | undefined>;
      };
      ready: (cb: (tw: Window['twttr']) => void) => void;
    };
  }
}

function extractTweetId(url: string): string | null {
  return url.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/)?.[1] ?? null;
}

function loadWidgetScript(onReady: () => void, onError: () => void) {
  if (window.twttr) {
    window.twttr.ready(onReady);
    return;
  }
  if (document.querySelector('script[src*="platform.twitter.com/widgets.js"]')) {
    // already injected, wait for it
    const poll = setInterval(() => {
      if (window.twttr) { clearInterval(poll); window.twttr.ready(onReady); }
    }, 100);
    setTimeout(() => { clearInterval(poll); onError(); }, 8000);
    return;
  }
  const script = document.createElement('script');
  script.src = 'https://platform.twitter.com/widgets.js';
  script.async = true;
  script.onload = () => window.twttr?.ready(onReady);
  script.onerror = onError;
  document.body.appendChild(script);
}

export function TweetEmbed({ url }: { url: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading');

  useEffect(() => {
    const tweetId = extractTweetId(url);
    if (!tweetId || !ref.current) { setStatus('error'); return; }
    const container = ref.current;
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    const render = () => {
      window.twttr!.widgets
        .createTweet(tweetId, container, { theme: dark ? 'dark' : 'light', dnt: true })
        .then(el => setStatus(el ? 'done' : 'error'))
        .catch(() => setStatus('error'));
    };

    loadWidgetScript(render, () => setStatus('error'));
  }, [url]);

  if (status === 'error') return null;

  return (
    <div
      ref={ref}
      className={status === 'loading' ? 'h-24 rounded-lg bg-muted animate-pulse' : ''}
    />
  );
}

export { extractTweetId };
