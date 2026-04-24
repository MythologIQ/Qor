/**
 * Builder Tick 62 | task-062-event-log-test
 * DOM event-log test for event-log.js
 * Tests verify: prepend order, 200-entry cap, and event format.
 */

import { describe, it, expect } from 'bun:test';

function makeDiv(): any {
  const kids: any[] = [];
  const style = {
    backgroundColor: '', display: '', width: '', height: '',
    borderRadius: '', marginRight: '', verticalAlign: '', fontSize: '', fontWeight: '',
  };
  const el: any = {
    localName: 'div', tagName: 'DIV', attributes: {}, textContent: '',
    childNodes: kids, children: kids, firstChild: null, lastChild: null, style,
    removeChild(c: any) {
      const i = kids.indexOf(c);
      if (i >= 0) kids.splice(i, 1);
      el.firstChild = kids[0] ?? null;
      el.lastChild = kids[kids.length - 1] ?? null;
    },
    appendChild(c: any) {
      kids.push(c); el.firstChild = kids[0]; el.lastChild = kids[kids.length - 1];
    },
    insertBefore(c: any, ref: any) {
      if (ref === null) kids.push(c);
      else { const i = kids.indexOf(ref); kids.splice(i >= 0 ? i : 0, 0, c); }
      el.firstChild = kids[0]; el.lastChild = kids[kids.length - 1];
    },
    setAttribute(n: string, v: string) { el.attributes[n] = v; },
    getAttribute(n: string) { return el.attributes[n] ?? null; },
    get className() { return el.attributes['class'] ?? ''; },
    set className(v: string) { el.attributes['class'] = v; },
    querySelectorAll(sel: string) {
      if (sel === '.event-entry') return kids.filter((c: any) => c.attributes?.['class'] === 'event-entry');
      return [];
    },
    replaceChildren() { kids.length = 0; el.firstChild = null; el.lastChild = null; },
  };
  return el;
}

function makeEl(tag: string): any {
  return makeDiv();
}

Object.defineProperty(globalThis, 'document', {
  value: { createElement: makeEl },
  writable: true,
  configurable: true,
});

const { appendEvent } = await import('../../src/public/event-log.js');

describe('event-log', () => {
  it('appendEvent prepends [turn N] side X: move Y→Z with timestamp', () => {
    const logEl = makeDiv();
    appendEvent(logEl, { turn: 1, side: 'X', move: 'A→B', timestamp: 1000 });
    appendEvent(logEl, { turn: 2, side: 'Y', move: 'C→D', timestamp: 2000 });
    const entries = logEl.querySelectorAll('.event-entry');
    expect(entries.length).toBe(2);
    expect(entries[0].textContent).toContain('Round 2');
    expect(entries[0].textContent).toContain('Side Y');
    expect(entries[0].textContent).toContain('C→D');
    expect(entries[1].textContent).toContain('Round 1');
    expect(entries[1].textContent).toContain('Side X');
    expect(entries[1].textContent).toContain('A→B');
  });

  it('log contains last 200 entries only', () => {
    const logEl = makeDiv();
    for (let i = 1; i <= 250; i++) {
      appendEvent(logEl, { turn: i, side: 'X', move: `${String.fromCharCode(64 + i)}→${String.fromCharCode(65 + i)}`, timestamp: i * 1000 });
    }
    const entries = logEl.querySelectorAll('.event-entry');
    expect(entries.length).toBe(200);
    expect(entries[0].textContent).toContain('Round 250');
    expect(entries[entries.length - 1].textContent).toContain('Round 51');
  });

  it('order preserved — oldest at bottom', () => {
    const logEl = makeDiv();
    for (let i = 1; i <= 5; i++) {
      const side = i % 2 === 0 ? 'X' : 'Y';
      appendEvent(logEl, { turn: i, side, move: `${i}→${i + 1}`, timestamp: i * 1000 });
    }
    const entries = logEl.querySelectorAll('.event-entry');
    expect(entries.length).toBe(5);
    expect(entries[0].textContent).toContain('Round 5');
    expect(entries[4].textContent).toContain('Round 1');
  });
});
