/**
 * Builder Tick 58 | task-058-hex-render-test
 * DOM render test for hex-render.js
 * Uses minimal SVG DOM stub — happy-dom unavailable in arena/test environment.
 */

import { describe, it, expect } from 'bun:test';
import * as hexRender from '../../src/public/hex-render.js';

const renderBoard = (hexRender as unknown as {
  renderBoard: (svg: SVGSVGElement, board: Array<{ coord: { q: number; r: number; s: number }; terrain: string }>) => void;
}).renderBoard;

// ── Minimal SVG DOM stub ──────────────────────────────────────────────────────

type Element = {
  localName: string;
  attributes: Record<string, string>;
  childNodes: Element[];
  textContent: string;
  firstChild: Element | null;
  _gCount?: number;
  _allElements?: Element[];
  removeChild: (el: Element) => void;
  appendChild: (el: Element) => void;
  setAttribute: (name: string, value: string) => void;
  getAttribute: (name: string) => string | null;
  ownerDocument: { createElementNS: (ns: string, tag: string) => Element };
};

/** Creates a fresh SVG element with a self-contained document stub. */
function makeSVG(): Element & { _gCount: number; _allElements: Element[] } {
  const allElements: Element[] = [];
  const children: Element[] = [];
  const doc: Element['ownerDocument'] = { createElementNS: makeFactory(allElements, children) };
  return createSVGElement(children, allElements, doc) as Element & { _gCount: number; _allElements: Element[] };
}

function makeFactory(allElements: Element[], parent: Element[]) {
  return function createElementNS(_ns: string, tag: string): Element {
    const kids: Element[] = [];
    const el = createSVGElement(kids, allElements, { createElementNS: makeFactory(allElements, kids) });
    el.localName = tag;
    allElements.push(el);
    parent.push(el);
    return el;
  };
}

function createSVGElement(
  kids: Element[],
  allElements: Element[],
  doc: Element['ownerDocument'],
): Element {
  return {
    localName: 'svg',
    attributes: {},
    textContent: '',
    firstChild: null,
    _gCount: 0,
    removeChild(el: Element) {
      const idx = kids.indexOf(el);
      if (idx >= 0) kids.splice(idx, 1);
      this.firstChild = kids[0] ?? null;
    },
    appendChild(el: Element) {
      if (el.localName === 'g') (this as Element & { _gCount: number })._gCount++;
      kids.push(el);
      this.firstChild = kids[0] ?? null;
    },
    setAttribute(name: string, value: string) {
      this.attributes[name] = value;
    },
    getAttribute(name: string) {
      return this.attributes[name] ?? null;
    },
    childNodes: kids,
    get ownerDocument() {
      return doc;
    },
  };
}

// ── Board helpers ─────────────────────────────────────────────────────────────

/**
 * Flattened 9×9 axial hex grid using odd-q offset → cube conversion.
 * Generates 81 unique cube coordinates with q+r+s=0.
 */
function makeBoard(size = 9): Array<{ coord: { q: number; r: number; s: number }; terrain: string }> {
  const cells: Array<{ coord: { q: number; r: number; s: number }; terrain: string }> = [];
  const terrains = ['PLAINS', 'HILLS', 'MOUNTAIN', 'WATER'];
  let idx = 0;
  for (let col = 0; col < size; col++) {
    for (let row = 0; row < size; row++) {
      const q = col;
      const r = row - Math.floor(q / 2);
      const s = -q - r;
      cells.push({ coord: { q, r, s }, terrain: terrains[idx % terrains.length] });
      idx++;
    }
  }
  return cells;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('hex-render', () => {
  it('creates 81 polygon groups for a 9×9 board', () => {
    const svg = makeSVG();
    globalThis.document = svg.ownerDocument as unknown as Document;
    try {
      renderBoard(svg as unknown as SVGSVGElement, makeBoard(9));
      expect(svg._gCount).toBe(81);
    } finally {
      delete (globalThis as unknown as Record<string, unknown>)['document'];
    }
  });

  it('assigns terrain class to each polygon', () => {
    const svg = makeSVG();
    globalThis.document = svg.ownerDocument as unknown as Document;
    try {
      renderBoard(svg as unknown as SVGSVGElement, [{ coord: { q: 0, r: 0, s: 0 }, terrain: 'WATER' }]);
      // SVG → <g> group → <polygon> child
      const group = svg.childNodes[0];
      const polygon = group.childNodes[0];
      const cls = polygon.attributes['class'];
      expect(cls).toBe('hex-water');
    } finally {
      delete (globalThis as unknown as Record<string, unknown>)['document'];
    }
  });

  it('sets viewBox on the SVG element', () => {
    const svg = makeSVG();
    globalThis.document = svg.ownerDocument as unknown as Document;
    try {
      renderBoard(svg as unknown as SVGSVGElement, []);
      expect(svg.attributes['viewBox']).toBe('-160 -160 320 320');
    } finally {
      delete (globalThis as unknown as Record<string, unknown>)['document'];
    }
  });

  it('each group is translated to cube pixel coordinates', () => {
    const svg = makeSVG();
    globalThis.document = svg.ownerDocument as unknown as Document;
    try {
      renderBoard(svg as unknown as SVGSVGElement, [{ coord: { q: 0, r: 0, s: 0 }, terrain: 'PLAINS' }]);
      const group = svg.childNodes[0];
      expect(group.attributes['transform']).toContain('translate');
    } finally {
      delete (globalThis as unknown as Record<string, unknown>)['document'];
    }
  });
});
