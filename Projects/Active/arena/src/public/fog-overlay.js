/**
 * Fog Overlay — task-060-fog-overlay
 * Adds .fog class to hex cells outside the visible area per perspective.
 */

/**
 * Apply fog-of-war overlay to hex grid SVG.
 * @param {SVGElement} svg
 * @param {Set<string>} visibleCells  Set of cell-coordinate keys visible to the perspective (e.g. "q,r,s")
 * @param {'A'|'B'|'both'} perspective  Which player's fog perspective to apply
 */
export function applyFog(svg, visibleCells, perspective) {
  if (!svg) return;

  const cellClass = perspective === 'both' ? '' : `.player-${perspective.toLowerCase()}`;

  svg.querySelectorAll('.hex-cell' + cellClass).forEach(cell => {
    const key = cell.dataset.coord;
    if (!key) return;

    if (visibleCells.has(key)) {
      cell.classList.remove('fog');
    } else {
      cell.classList.add('fog');
    }
  });
}

/**
 * Clear all fog classes from the SVG.
 * @param {SVGElement} svg
 */
export function clearFog(svg) {
  if (!svg) return;
  svg.querySelectorAll('.fog').forEach(cell => cell.classList.remove('fog'));
}
