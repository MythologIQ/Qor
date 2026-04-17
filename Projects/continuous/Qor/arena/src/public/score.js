/**
 * Score display renderer.
 * Renders: 'Turn N/50 — A: 15 territories | B: 12 territories'
 * @param {HTMLElement} el
 * @param {{ a: number, b: number, turn: number, turnCap: number }} state
 */
export function updateScore(el, { a, b, turn, turnCap }) {
  el.textContent = `Turn ${turn}/${turnCap} — A: ${a} territories | B: ${b} territories`;
}
