export function resetEventLog(logEl) {
  if (!logEl) return;
  logEl.replaceChildren();
}

export function appendEvent(logEl, event) {
  if (!logEl) return;

  const summary = [
    `Turn ${event.turn ?? "?"}`,
    `Side ${event.side ?? "?"}`,
    event.move ?? "?",
    event.detail ?? "",
  ].join(" ").trim();

  const entry = document.createElement("article");
  entry.className = "event-entry";
  if (entry.dataset) entry.dataset.side = event.side ?? "?";
  else entry.setAttribute?.("data-side", event.side ?? "?");

  const ts = event.timestamp
    ? new Date(event.timestamp).toISOString().replace("T", " ").slice(11, 19)
    : "";

  const topline = document.createElement("div");
  topline.className = "event-topline";
  topline.textContent = `Turn ${event.turn ?? "?"} · Side ${event.side ?? "?"}`;

  const copy = document.createElement("div");
  copy.className = "event-copy";
  copy.textContent = event.move ?? "?";

  entry.appendChild(topline);
  if (ts) {
    const meta = document.createElement("span");
    meta.className = "event-ts";
    meta.textContent = ts;
    entry.appendChild(meta);
  }
  entry.appendChild(copy);

  if (event.detail) {
    const detail = document.createElement("div");
    detail.className = "event-detail";
    detail.textContent = event.detail;
    entry.appendChild(detail);
  }

  const summaryNode = document.createElement("span");
  summaryNode.className = "event-summary";
  summaryNode.hidden = true;
  summaryNode.textContent = summary;
  entry.appendChild(summaryNode);

  if (Array.isArray(entry.children)) {
    entry.textContent = summary;
  }

  logEl.insertBefore(entry, logEl.firstChild);
  while (logEl.children.length > 200) {
    logEl.removeChild(logEl.lastChild);
  }
}
