import { describe, it, expect } from 'vitest';
import { renderJpdictCardHtml } from './JpdictCard';

describe('renderJpdictCardHtml', () => {
  it('strips event handlers and forbidden tags', () => {
    const html = renderJpdictCardHtml('hello <img src=x onerror=alert(1) /> <svg><script>alert(1)</script></svg>');
    expect(html).not.toMatch(/onerror/i);
    expect(html).not.toMatch(/<svg/i);
    expect(html).not.toMatch(/<script/i);
  });

  it('removes non-http(s)/mailto links', () => {
    const html = renderJpdictCardHtml('[x](javascript:alert(1)) [y](data:text/html;base64,PHNjcmlwdD4=) [ok](https://example.com)');
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toMatch(/data:/i);
    expect(html).toMatch(/https:\/\/example\.com/);
  });

  it('keeps ruby tags for jpdict rendering', () => {
    const html = renderJpdictCardHtml('<ruby>漢字<rt>かんじ</rt></ruby>');
    expect(html).toMatch(/<ruby>/i);
    expect(html).toMatch(/<rt>/i);
  });
});
