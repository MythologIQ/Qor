export function resetEventLog(logEl) {
  if (!logEl) return;
  logEl.replaceChildren();
}

/** Renders an event into the log element. Supports all Plan D v2 event types. */
export function appendEvent(logEl, event) {
  if (!logEl) return;

  const summary = [
    `Round ${event.turn ?? "?"}`,
    `Side ${event.side ?? "?"}`,
    event.move ?? event.headline ?? "?",
    event.detail ?? "",
  ].join(" ").trim();

  const entry = document.createElement("article");
  entry.className = "event-entry";
  const side = event.side ?? "?";
  entry.dataset ? entry.dataset.side = side : entry.setAttribute?.("data-side", side);

  // Determine dot color and label based on event type
  const dotColor = getEventDotColor(event);
  const label = getEventLabel(event);

  const ts = event.timestamp
    ? new Date(event.timestamp).toISOString().replace("T", " ").slice(11, 19)
    : "";

  const topline = document.createElement("div");
  topline.className = "event-topline";

  // Dot indicator
  const dot = document.createElement("span");
  dot.className = "event-dot";
  dot.style.backgroundColor = dotColor;
  dot.style.display = "inline-block";
  dot.style.width = "8px";
  dot.style.height = "8px";
  dot.style.borderRadius = "50%";
  dot.style.marginRight = "6px";
  dot.style.verticalAlign = "middle";

  topline.appendChild(dot);

  const labelSpan = document.createElement("span");
  labelSpan.className = "event-label-tag";
  labelSpan.textContent = label;
  labelSpan.style.marginRight = "6px";
  labelSpan.style.fontSize = "0.75em";
  labelSpan.style.fontWeight = "600";
  labelSpan.style.color = dotColor;
  topline.appendChild(labelSpan);

  const roundText = document.createElement("span");
  roundText.textContent = `Round ${event.turn ?? "?"} · Side ${side}`;
  topline.appendChild(roundText);

  const copy = document.createElement("div");
  copy.className = "event-copy";
  copy.textContent = event.move ?? event.headline ?? "?";

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

/** Returns the CSS color for the event dot indicator. */
function getEventDotColor(event) {
  const t = event.eventType ?? event.type ?? "";
  if (t === "reserve_fired") return "#ef4444";           // red
  if (t === "wasted_action") return "#9ca3af";            // gray
  if (t === "action_retargeted") return "#f97316";       // orange
  if (t === "plan_rejected") return "#ef4444";           // red
  if (t === "bid_resolved") return "#3b82f6";            // blue
  if (t === "round_started") return "#22c55e";           // green
  if (t === "round_ended") return "#6b7280";             // dark gray
  if (t === "boosted_ability") return "#8b5cf6";        // purple
  if (t === "second_attack") return "#f59e0b";           // amber
  if (t === "defensive_stance") return "#14b8a6";        // teal
  if (t === "reserve_overwatch") return "#ec4899";        // pink
  if (t === "unit_destroyed") return "#ef4444";           // red
  if (t === "unit_attacked") return "#f97316";            // orange
  if (t === "unit_moved") return "#22c55e";               // green
  return "#6b7280";                                       // default gray
}

/** Returns the short label shown next to the dot. */
function getEventLabel(event) {
  const t = event.eventType ?? event.type ?? "";
  const detail = event.detail ?? "";
  if (t === "reserve_fired") return "OVERWATCH";
  if (t === "wasted_action") return "WASTED";
  if (t === "action_retargeted") {
    if (detail.includes("rushed_shot")) return "RUSHED SHOT";
    return "RETARGET";
  }
  if (t === "plan_rejected") return "REJECTED";
  if (t === "bid_resolved") return "BID";
  if (t === "round_started") return "ROUND START";
  if (t === "round_ended") return "ROUND END";
  if (t === "boosted_ability") return "BOOSTED";
  if (t === "second_attack") return "2ND ATTACK";
  if (t === "defensive_stance") return "STANCE";
  if (t === "reserve_overwatch") return "OVERWATCH SET";
  if (t === "unit_destroyed") return "DESTROYED";
  if (t === "unit_attacked") return "ATTACK";
  if (t === "unit_moved") return "MOVE";
  return "";
}