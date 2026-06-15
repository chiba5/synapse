// RSS / Atom フィード（vault/ai-digest/sources.md から移植 2026-05-20）
export const RSS_SOURCES = [
  { name: 'Simon Willison',      url: 'https://simonwillison.net/atom/everything/' },
  { name: 'Zenn: Claude Code',   url: 'https://zenn.dev/topics/claudecode/feed' },
  { name: 'Latent Space',        url: 'https://www.latent.space/feed' },
  { name: 'Hugging Face Blog',   url: 'https://huggingface.co/blog/feed.xml' },
  { name: 'Import AI',           url: 'https://importai.substack.com/feed' },
  { name: 'Ahead of AI',         url: 'https://magazine.sebastianraschka.com/feed' },
  { name: 'Zenn: LLM',           url: 'https://zenn.dev/topics/llm/feed' },
  { name: 'Zenn: Generative AI', url: 'https://zenn.dev/topics/generativeai/feed' },
];

// GitHub JSON API
export const GITHUB_SOURCES = [
  { name: 'Claude Code Releases', url: 'https://api.github.com/repos/anthropics/claude-code/releases' },
];

// 興味トピック × 高信号アカウント（二人共通の関心セット）。
// hermes-x-search 用。accounts/keywords は運用で随時 sources.ts を直接編集して調整する（初期 seed）。
export type Topic = { name: string; accounts: string[]; keywords: string };

export const TOPICS: Topic[] = [
  { name: 'Claude Code tips',          accounts: ['@AnthropicAI'],                 keywords: 'Claude Code 新機能 tips workflow subagent skill' },
  { name: 'Model deprecation/release', accounts: ['@AnthropicAI', '@OpenAI', '@GoogleDeepMind'], keywords: 'LLM model release deprecation new model frontier' },
  { name: 'Physical AI / Humanoid',    accounts: ['@Figure_robot', '@Tesla_Optimus'], keywords: 'physical AI humanoid robot embodied' },
  { name: 'SpaceX',                    accounts: ['@SpaceX', '@elonmusk'],         keywords: 'SpaceX Starship launch' },
  { name: 'Neuralink',                 accounts: ['@neuralink'],                   keywords: 'Neuralink brain computer interface implant' },
  { name: 'Tesla FSD',                 accounts: ['@Tesla', '@elonmusk'],          keywords: 'Tesla FSD full self driving autonomy' },
];
