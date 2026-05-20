import Anthropic from '@anthropic-ai/sdk';
import { getRequestContext } from '@cloudflare/next-on-pages';

function getAnthropicKey(): string {
  try {
    const env = getRequestContext().env as Record<string, string>;
    return env['ANTHROPIC_API_KEY'] ?? '';
  } catch {
    return process.env['ANTHROPIC_API_KEY'] ?? '';
  }
}

export type FeedItemClassification = {
  summary: string;
  category: 'practical' | 'knowledge' | 'claude_runnable';
  claude_runnable: boolean;
};

export async function classifyFeedItem(item: {
  title: string;
  body?: string;
  source_url?: string;
}): Promise<FeedItemClassification> {
  const client = new Anthropic({ apiKey: getAnthropicKey() });
  const excerpt = (item.body ?? '').slice(0, 500);

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `以下のAI・技術ニュース記事を2〜3文で日本語要約し、カテゴリを判定してください。

タイトル: ${item.title}
URL: ${item.source_url ?? 'N/A'}
本文（抜粋）: ${excerpt}

以下のJSONのみ返してください（他のテキスト不要）:
{"summary":"2〜3文の日本語要約","category":"practical|knowledge|claude_runnable","claude_runnable":true|false}

カテゴリ定義:
- practical: 実務・開発ですぐ使える（APIリリース、ツール公開など）
- claude_runnable: Claude Codeで今すぐ試せる実装例・コード・機能
- knowledge: 知識・トレンド・研究として知っておくべき内容`,
    }],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';

  try {
    const parsed = JSON.parse(text);
    const validCategories = ['practical', 'knowledge', 'claude_runnable'];
    return {
      summary: String(parsed.summary ?? ''),
      category: (validCategories.includes(parsed.category)
        ? parsed.category
        : 'knowledge') as FeedItemClassification['category'],
      claude_runnable: Boolean(parsed.claude_runnable),
    };
  } catch {
    return { summary: item.title, category: 'knowledge', claude_runnable: false };
  }
}
