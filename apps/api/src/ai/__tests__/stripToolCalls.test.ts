import { describe, expect, it } from 'vitest';
import { stripTextToolCalls } from '../../services/explanationService.js';

describe('stripTextToolCalls', () => {
  it('removes the exact leak seen in production', () => {
    const raw =
      '<tool_call> <function=read_files> <parameter=paths> ' +
      '["frontend/src/services/spot.service.ts", "frontend/src/services/story.service.ts"] ' +
      '</parameter> </function> </tool_call>';
    expect(stripTextToolCalls(raw)).toBe('');
  });

  it('keeps the real answer around a leaked call', () => {
    const raw = 'WebSockets connect on login.\n\n<tool_call>read_files</tool_call>\n\nThen events flow.';
    const out = stripTextToolCalls(raw);
    expect(out).toContain('WebSockets connect on login.');
    expect(out).toContain('Then events flow.');
    expect(out).not.toContain('tool_call');
  });

  it('removes a bare <function=…> block', () => {
    expect(stripTextToolCalls('<function=read_files>x</function>')).toBe('');
  });

  it('leaves ordinary answers untouched, including code about functions', () => {
    const md = 'The `connect()` function opens the socket:\n\n```ts\nsocket.on("join", fn);\n```';
    expect(stripTextToolCalls(md)).toBe(md);
  });

  it('does not eat generic angle brackets or JSX', () => {
    const md = 'It renders `<Header title="x" />` inside `<View>`.';
    expect(stripTextToolCalls(md)).toBe(md);
  });
});
