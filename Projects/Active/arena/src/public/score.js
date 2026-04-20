export function updateScore(el, { a, b, turn, turnCap, phase }) {
  if (!el) return;
  el.replaceChildren();

  const row = document.createElement("div");
  row.className = "score-row";

  const teamA = document.createElement("div");
  teamA.className = "score-team";
  teamA.dataset.side = "A";
  teamA.innerHTML = `<span>Blue Horizon</span><strong>${a}</strong>`;

  const divider = document.createElement("div");
  divider.className = "score-divider";
  divider.textContent = "vs";

  const teamB = document.createElement("div");
  teamB.className = "score-team";
  teamB.dataset.side = "B";
  teamB.innerHTML = `<span>Red Morrow</span><strong>${b}</strong>`;

  row.append(teamA, divider, teamB);

  const footer = document.createElement("div");
  footer.className = "score-footer";
  footer.innerHTML = `<span>${phase}</span><span>Turn ${turn}/${turnCap}</span>`;

  el.append(row, footer);
}
