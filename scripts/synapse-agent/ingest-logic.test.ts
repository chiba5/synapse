import { describe, it, expect } from 'vitest';
import {
  parseClassification,
  passesThreshold,
  slugifyTopic,
  digestSourceUrl,
  toJstDate,
} from './ingest-logic';

describe('parseClassification', () => {
  it('正常な JSON を構造体にする', () => {
    const text = '{"summary":"要約だ","category":"practical","claude_runnable":true,"score":80}';
    expect(parseClassification(text, 'fallback title')).toEqual({
      summary: '要約だ', category: 'practical', claude_runnable: true, score: 80,
    });
  });
  it('前後に余計なテキストがあっても最初の JSON を拾う', () => {
    const text = 'はい:\n{"summary":"s","category":"knowledge","claude_runnable":false,"score":30}\n以上';
    expect(parseClassification(text, 'ft').score).toBe(30);
  });
  it('不正な category は knowledge にフォールバック', () => {
    const text = '{"summary":"s","category":"bogus","claude_runnable":false,"score":50}';
    expect(parseClassification(text, 'ft').category).toBe('knowledge');
  });
  it('score を 0-100 にクランプ', () => {
    expect(parseClassification('{"summary":"s","category":"knowledge","claude_runnable":false,"score":150}', 'ft').score).toBe(100);
    expect(parseClassification('{"summary":"s","category":"knowledge","claude_runnable":false,"score":-5}', 'ft').score).toBe(0);
  });
  it('パース不能ならフォールバック（score 0・title を summary に）', () => {
    expect(parseClassification('not json', 'タイトル')).toEqual({
      summary: 'タイトル', category: 'knowledge', claude_runnable: false, score: 0,
    });
  });
});

describe('passesThreshold', () => {
  it('閾値以上は true', () => {
    expect(passesThreshold(40, 40)).toBe(true);
    expect(passesThreshold(41, 40)).toBe(true);
  });
  it('閾値未満は false', () => {
    expect(passesThreshold(39, 40)).toBe(false);
  });
});

describe('slugifyTopic', () => {
  it('英数字小文字とハイフンに正規化', () => {
    expect(slugifyTopic('Claude Code tips')).toBe('claude-code-tips');
    expect(slugifyTopic('Physical AI / Robotics')).toBe('physical-ai-robotics');
  });
});

describe('digestSourceUrl', () => {
  it('topic と JST 日付から合成キーを作る', () => {
    expect(digestSourceUrl('Claude Code tips', '2026-06-15')).toBe('x-digest://claude-code-tips/2026-06-15');
  });
});

describe('toJstDate', () => {
  it('UTC を +9h して YYYY-MM-DD', () => {
    expect(toJstDate('2026-06-15T16:00:00.000Z')).toBe('2026-06-16'); // JST 01:00 翌日
    expect(toJstDate('2026-06-15T00:00:00.000Z')).toBe('2026-06-15');
  });
});
