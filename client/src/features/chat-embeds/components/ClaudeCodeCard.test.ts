import { describe, it, expect } from 'vitest';
import { renderClaudeCodeCardHtml } from './ClaudeCodeCard';

describe('renderClaudeCodeCardHtml', () => {
  it('renders obsidian callout blocks', () => {
    const html = renderClaudeCodeCardHtml('> [!warning] Be careful\n> use this command carefully');
    expect(html).toMatch(/<details/i);
    expect(html).toMatch(/data-callout-type="warning"/i);
    expect(html).toContain('Be careful');
    expect(html).toContain('use this command carefully');
    expect(html).not.toContain('[!warning]');
    expect(html).not.toMatch(/<details[^>]*\sopen(\s|>)/i);
  });

  it('renders footer callout blocks', () => {
    const html = renderClaudeCodeCardHtml('> [!footer] 运行统计\n> ⏱️ 1.0s');
    expect(html).toMatch(/data-callout-type="footer"/i);
    expect(html).toContain('运行统计');
    expect(html).toContain('⏱️ 1.0s');
    expect(html).not.toMatch(/<details[^>]*data-callout-type="footer"/i);
  });

  it('supports + marker as expanded by default', () => {
    const html = renderClaudeCodeCardHtml('> [!tip]+ 已展开\n> hello');
    expect(html).toMatch(/<details[^>]*\sopen(?:=|\s|>)/i);
  });

  it('strips event handlers and forbidden tags', () => {
    const html = renderClaudeCodeCardHtml('hello <img src=x onerror=alert(1) /> <svg><script>alert(1)</script></svg>');
    expect(html).not.toMatch(/onerror/i);
    expect(html).not.toMatch(/<svg/i);
    expect(html).not.toMatch(/<script/i);
  });

  it('removes non-http(s)/mailto links', () => {
    const html = renderClaudeCodeCardHtml('[x](javascript:alert(1)) [y](data:text/html;base64,PHNjcmlwdD4=) [ok](https://example.com)');
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toMatch(/data:/i);
    expect(html).toMatch(/https:\/\/example\.com/);
  });
});
