'use client';

import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';

export function MarkdownBody({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={cn(
        'prose prose-sm dark:prose-invert max-w-none',
        'prose-p:my-1 prose-headings:mt-3 prose-headings:mb-1',
        'prose-code:bg-muted prose-code:px-1 prose-code:rounded prose-code:text-xs',
        'prose-pre:bg-muted prose-pre:rounded-lg prose-pre:text-xs',
        className
      )}
    >
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}
