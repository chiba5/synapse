// RSS / Atom フィード（vault/ai-digest/sources.md から移植 2026-05-20）
export const RSS_SOURCES = [
  { name: 'Simon Willison',      url: 'https://simonwillison.net/atom/everything/' },
  { name: 'Zenn: Claude Code',   url: 'https://zenn.dev/topics/claudecode/feed' },
  { name: 'Latent Space',        url: 'https://www.latent.space/feed' },
  { name: 'Hugging Face Blog',   url: 'https://huggingface.co/blog/feed.xml' },
  { name: 'Import AI',           url: 'https://importai.substack.com/feed' },
  { name: 'Ahead of AI',        url: 'https://magazine.sebastianraschka.com/feed' },
  { name: 'Zenn: LLM',          url: 'https://zenn.dev/topics/llm/feed' },
  { name: 'Zenn: Generative AI', url: 'https://zenn.dev/topics/generativeai/feed' },
];

// GitHub JSON API
export const GITHUB_SOURCES = [
  { name: 'Claude Code Releases', url: 'https://api.github.com/repos/anthropics/claude-code/releases' },
];

// hermes-x-search で実行するクエリ
export const X_QUERIES = [
  '"Claude Code" update OR feature 2026',
  '"Anthropic" announcement 2026',
  'LLM OR "AI model" release latest 2026',
];
