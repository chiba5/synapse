'use client';

import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';

/**
 * Dependency-free remark plugin: turn @mentions inside text nodes into
 * styled <span class="mention"> nodes. Walks the mdast tree manually so we
 * don't need unist-util-visit as a direct dependency.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function remarkMentions() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walk = (node: any) => {
    if (!node || !Array.isArray(node.children)) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out: any[] = [];
    for (const child of node.children) {
      if (child.type === 'text' && typeof child.value === 'string' && child.value.includes('@')) {
        const parts = child.value.split(/(@[\w.\-]+)/g);
        for (const part of parts) {
          if (!part) continue;
          if (/^@[\w.\-]+$/.test(part)) {
            out.push({
              type: 'strong',
              data: { hName: 'span', hProperties: { className: 'mention' } },
              children: [{ type: 'text', value: part }],
            });
          } else {
            out.push({ type: 'text', value: part });
          }
        }
      } else {
        walk(child);
        out.push(child);
      }
    }
    node.children = out;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tree: any) => walk(tree);
}

export function ChatMarkdown({ children, dark }: { children: string; dark?: boolean }) {
  return (
    <div
      className={cn(
        'prose prose-sm max-w-none break-words',
        'prose-p:my-0.5 prose-headings:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0',
        'prose-code:px-1 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none',
        'prose-pre:rounded-lg prose-pre:text-xs prose-pre:my-1 prose-pre:p-2.5',
        'prose-a:underline',
        // mention chip works on both glass and violet bubbles
        '[&_.mention]:bg-violet-500/25 [&_.mention]:rounded [&_.mention]:px-1 [&_.mention]:font-medium',
        dark
          ? 'prose-invert prose-code:bg-black/25 prose-pre:bg-black/30 prose-a:text-violet-100'
          : 'dark:prose-invert prose-code:bg-black/20 prose-pre:bg-black/25 prose-a:text-violet-500',
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkMentions]}>{children}</ReactMarkdown>
    </div>
  );
}
