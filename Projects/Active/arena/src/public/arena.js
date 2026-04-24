import { renderBoard } from "./hex-render.js?v=20260422b2";
import { applyFog, clearFog } from "./fog-overlay.js?v=20260422b1";
import { renderUnits } from "./unit-render.js?v=20260422b2";
import { appendEvent, resetEventLog } from "./event-log.js?v=20260422b1";
import { updateAgentStatus } from "./agent-status.js?v=20260422c4";
import { updateAgentBubbles } from "./agent-bubbles.js?v=20260422d1";
import { connectSpectator } from "./ws-client.js?v=20260422b1";
import { DEMO_MATCH_ID, playDemoReplay } from "./demo-replay.js?v=20260422c5";
import { installReplayKeyboard } from "./keyboard.js?v=20260422b1";
import { mountUnitRoster } from "./unit-roster.js?v=20260422r1";

const boardEl = document.getElementById("board");
const logEl = document.getElementById("eventLog");
const agentEl = document.getElementById("agentStatus");
const bubbleAEl = document.getElementById("bubbleA");
const bubbleBEl = document.getElementById("bubbleB");
const badgeEl = document.getElementById("modeBadge");
const matchStatusEl = document.getElementById("matchStatus");
const phaseEl = document.getElementById("phasePill");
const pressureEl = document.getElementById("pressureValue");
const progressFillEl = document.getElementById("progressFill");
const progressLabelEl = document.getElementById("progressLabel");
const timelineEl = document.getElementById("timeline");
const turnTickerEl = document.getElementById("turnTicker");
const momentumLabelEl = document.getElementById("momentumLabel");
const momentumSparklineEl = document.getElementById("momentumSparkline");
const shareAEl = document.getElementById("shareA");
const shareBEl = document.getElementById("shareB");
const sideANameEl = document.getElementById("sideAName");
const sideBNameEl = document.getElementById("sideBName");
const sideAOperatorEl = document.getElementById("sideAOperator");
const sideBOperatorEl = document.getElementById("sideBOperator");
const autoplayEl = document.getElementById("autoplayStatus");
const restartButton = document.getElementById("restartDemo");
const toggleButton = document.getElementById("togglePlayback");
const shareArenaButton = document.getElementById("shareArena");
const focusModeButton = document.getElementById("focusModeButton");
const quickstartDialog = document.getElementById("quickstartDialog");
const quickstartButton = document.getElementById("openQuickstart");
const briefingClose = document.querySelector(".briefing-close");
const briefingSlides = Array.from(document.querySelectorAll("[data-briefing-slide]"));
const briefingDots = Array.from(document.querySelectorAll("[data-briefing-dot]"));
const briefingPrev = document.getElementById("briefingPrev");
const briefingNext = document.getElementById("briefingNext");
const briefingCurrent = document.getElementById("briefingCurrent");
const briefingTotal = document.getElementById("briefingTotal");

let currentConnection = null;
let isDemoMode = false;
let isPaused = false;
let latestTurn = 0;
let latestRoundCap = 0;
let uninstallReplayKeyboard = null;
let momentumHistory = [];

function viewStateFromProjection(projection) {
  return {
    board: (projection.board?.cells ?? []).map((cell) => ({
      coord: { q: cell.q, r: cell.r, s: cell.s },
      terrain: cell.terrain,
      control: cell.controlledBy ?? null,
    })),
    territories: projection.board?.territories ?? { A: 0, B: 0 },
    turn: projection.round ?? 0,
    roundCap: projection.roundCap ?? 0,
    units: (projection.board?.units ?? []).map((unit) => ({
      id: unit.id,
      owner: unit.side,
      position: { q: unit.q, r: unit.r, s: unit.s },
      hp: unit.hp,
      strength: unit.strength,
      type: unit.type,
      facing: unit.facing,
    })),
    agents: ["A", "B"].map((side) => {
      const panel = projection.sides?.[side];
      return {
        id: `${projection.matchId}-${side}`,
        side: panel?.side ?? side,
        operator: panel?.operator ?? (side === "A" ? "Blue Horizon" : "Red Morrow"),
        modelId: panel?.modelId ?? "unknown",
        status: panel?.status ?? "idle",
        totalMs: panel?.totalMs ?? 0,
        totalActions: panel?.totalActions ?? 0,
        invalidCount: panel?.invalidCount ?? 0,
      };
    }),
    reasoning: ["A", "B"].flatMap((side) =>
      (projection.sides?.[side]?.reasoning ?? []).map((entry) => ({
        agentId: entry.agentId,
        side: entry.side,
        reasoning: entry.text,
      })),
    ),
    headline: projection.featured?.headline ?? "Awaiting opening exchange.",
    phase: projection.phase ?? "Spectator Feed",
    pressure: projection.pressure ?? 0,
    featuredEvent: projection.featured?.detail ?? "No featured event yet.",
  };
}

function ensureSvg() {
  let svg = boardEl.querySelector("svg");
  if (!svg) {
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("id", "arena-svg");
    boardEl.appendChild(svg);
  }
  return svg;
}

function showVictory(winner, reason = "") {
  const banner = document.getElementById("victory-banner");
  const winnerName = winner === "A" ? "Blue Horizon" : winner === "B" ? "Red Morrow" : "No Victor";
  banner.hidden = false;
  banner.dataset.winner = winner ?? "draw";
  banner.querySelector("[data-victory-title]").textContent =
    winner === "A" ? "Blue Horizon Closes The Gate" : winner === "B" ? "Red Morrow Survives" : "No Victor";
  banner.querySelector("[data-victory-copy]").textContent =
    reason ? `${winnerName} wins by ${reason.replaceAll("_", " ")}.` : `${winnerName} wins.`;
}

function hideVictory() {
  const banner = document.getElementById("victory-banner");
  banner.hidden = true;
}

function defaultVisibleCells() {
  return null;
}

function applyFogForState(svg) {
  const fogCells = defaultVisibleCells();
  clearFog(svg);
  if (fogCells) applyFog(svg, fogCells, "both");
}

function formatMatchId(matchId) {
  if (!matchId) return "Live Agent Match";
  return `Live Agent Match #${matchId.slice(-4).toUpperCase()}`;
}

function toPct(value) {
  return `${Math.round(value)}%`;
}

function resolveSideState(state) {
  const bySide = new Map((state.agents ?? []).map((agent) => [agent.side, agent]));
  const a = bySide.get("A") ?? {};
  const b = bySide.get("B") ?? {};
  const territoryA = state.territories?.A ?? 0;
  const territoryB = state.territories?.B ?? 0;
  const total = Math.max(1, territoryA + territoryB);
  const shareA = (territoryA / total) * 100;
  const shareB = (territoryB / total) * 100;

  return {
    a,
    b,
    territoryA,
    territoryB,
    shareA,
    shareB,
  };
}

function renderMomentum(shareA) {
  if (!momentumSparklineEl) return;
  momentumHistory.push(shareA);
  if (momentumHistory.length > 24) momentumHistory = momentumHistory.slice(-24);

  const width = 180;
  const height = 42;
  const points = momentumHistory.map((value, index) => {
    const x = momentumHistory.length === 1 ? 0 : (index / (momentumHistory.length - 1)) * width;
    const y = height - ((value - 25) / 50) * height;
    return [x, Math.max(4, Math.min(height - 4, y))];
  });

  const line = points.map(([x, y]) => `${x},${y}`).join(" ");
  const baseline = points.length
    ? `0,${height} ${line} ${width},${height}`
    : `0,${height} ${width},${height}`;

  momentumSparklineEl.innerHTML = `
    <defs>
      <linearGradient id="momentumStroke" x1="0%" x2="100%" y1="0%" y2="0%">
        <stop offset="0%" stop-color="#357cff" />
        <stop offset="55%" stop-color="#72b3ff" />
        <stop offset="100%" stop-color="#ff786d" />
      </linearGradient>
    </defs>
    <path d="M0 ${height} L${baseline} Z" fill="rgba(53,124,255,0.08)"></path>
    <polyline fill="none" stroke="url(#momentumStroke)" stroke-width="2.2" points="${line}"></polyline>
  `;
}

function updateTopbar(mode, matchId) {
  if (!badgeEl) return;
  badgeEl.textContent = mode === "demo" ? "Demo Broadcast" : "Live Arena";
  badgeEl.dataset.mode = mode === "demo" ? "demo" : "live";
  if (matchStatusEl) {
    matchStatusEl.textContent = mode === "demo" ? "Featured Replay Stream" : formatMatchId(matchId);
  }
}

function updateChrome(state) {
  latestTurn = state.turn ?? latestTurn;
  latestRoundCap = state.roundCap ?? latestRoundCap;

  const { a, b, shareA, shareB } = resolveSideState(state);
  const progress = latestRoundCap > 0 ? Math.max(0, Math.min(100, (latestTurn / latestRoundCap) * 100)) : 0;
  const diff = shareA - shareB;

  phaseEl.textContent = state.phase ?? "Pressure Build";
  pressureEl.textContent = toPct(state.pressure ?? 0);
  progressFillEl.style.width = `${progress}%`;
  progressLabelEl.textContent = latestRoundCap > 0 ? `Resolution track ${latestTurn} of ${latestRoundCap}` : "Awaiting match state";
  turnTickerEl.textContent = latestRoundCap > 0 ? `${latestTurn} / ${latestRoundCap}` : "-- / --";

  shareAEl.textContent = toPct(shareA);
  shareBEl.textContent = toPct(shareB);

  sideANameEl.textContent = (a.operator ?? "Blue Horizon").replace(/^Blue\s+/i, "").toUpperCase();
  sideBNameEl.textContent = (b.operator ?? "Red Morrow").replace(/^Red\s+/i, "").toUpperCase();
  sideAOperatorEl.textContent = `Operator: ${a.operator ?? "Blue Horizon"}`;
  sideBOperatorEl.textContent = `Operator: ${b.operator ?? "Red Morrow"}`;

  if (Math.abs(diff) < 6) {
    momentumLabelEl.textContent = "Even Fight";
    momentumLabelEl.style.color = "var(--gold)";
  } else if (diff > 0) {
    momentumLabelEl.textContent = "Blue Advantage";
    momentumLabelEl.style.color = "var(--blue)";
  } else {
    momentumLabelEl.textContent = "Red Advantage";
    momentumLabelEl.style.color = "var(--red)";
  }

  renderMomentum(shareA);
}

function renderTimeline(state) {
  if (!timelineEl || !state.roundCap) return;
  timelineEl.replaceChildren();
  for (let i = 1; i <= state.roundCap; i += 1) {
    const marker = document.createElement("div");
    marker.className = "timeline-marker";
    marker.textContent = i === 1 || i === state.roundCap || i === state.turn ? String(i) : "";
    if (i < state.turn) marker.dataset.state = "past";
    if (i === state.turn) marker.dataset.state = "current";
    timelineEl.appendChild(marker);
  }
}

function renderState(svg, state) {
  renderBoard(svg, state.board ?? [], state);
  updateAgentStatus(agentEl, state.agents ?? []);
  updateAgentBubbles(bubbleAEl, bubbleBEl, state.reasoning ?? [], state.agents ?? []);
  updateChrome(state);
  renderTimeline(state);
  applyFogForState(svg);
  renderUnits(svg, state.units ?? []);
}

function updatePlaybackUi() {
  autoplayEl.textContent = isDemoMode ? (isPaused ? "Replay Paused" : "Replay Live") : "Live Socket";
  if (toggleButton) toggleButton.hidden = !isDemoMode;
  if (restartButton) restartButton.hidden = !isDemoMode;
  if (toggleButton) toggleButton.textContent = isPaused ? "Resume" : "Pause";
}

function bindDemoControls() {
  if (restartButton) {
    restartButton.onclick = () => {
      currentConnection?.restart?.();
      hideVictory();
      resetEventLog(logEl);
      momentumHistory = [];
      isPaused = false;
      updatePlaybackUi();
    };
  }
  if (toggleButton) {
    toggleButton.onclick = () => {
      if (!currentConnection) return;
      if (isPaused) {
        currentConnection.resume?.();
        isPaused = false;
      } else {
        currentConnection.pause?.();
        isPaused = true;
      }
      updatePlaybackUi();
    };
  }
}

let briefingIndex = 0;

function syncBriefing(nextIndex) {
  if (!briefingSlides.length) return;
  briefingIndex = ((nextIndex % briefingSlides.length) + briefingSlides.length) % briefingSlides.length;
  briefingSlides.forEach((slide, index) => {
    slide.hidden = index !== briefingIndex;
  });
  briefingDots.forEach((dot, index) => {
    dot.dataset.active = index === briefingIndex ? "true" : "false";
  });
  if (briefingCurrent) briefingCurrent.textContent = String(briefingIndex + 1);
  if (briefingTotal) briefingTotal.textContent = String(briefingSlides.length);
}

function bindQuickstart() {
  if (!(quickstartDialog instanceof HTMLDialogElement) || !(quickstartButton instanceof HTMLButtonElement)) return;

  syncBriefing(0);
  quickstartButton.addEventListener("click", () => {
    syncBriefing(0);
    if (!quickstartDialog.open) quickstartDialog.showModal();
  });

  briefingPrev?.addEventListener("click", () => syncBriefing(briefingIndex - 1));
  briefingNext?.addEventListener("click", () => syncBriefing(briefingIndex + 1));
  briefingDots.forEach((dot, index) => dot.addEventListener("click", () => syncBriefing(index)));
  briefingClose?.addEventListener("click", () => quickstartDialog.close());

  quickstartDialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      syncBriefing(briefingIndex - 1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      syncBriefing(briefingIndex + 1);
    }
  });

  quickstartDialog.addEventListener("click", (event) => {
    const rect = quickstartDialog.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (!inside) quickstartDialog.close();
  });
}

function bindReplayKeyboard() {
  uninstallReplayKeyboard?.();
  uninstallReplayKeyboard = installReplayKeyboard(currentConnection, latestRoundCap || 50);
}

function bindShellActions() {
  shareArenaButton?.addEventListener("click", async () => {
    const shareUrl = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: "HexaWars Arena", url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      shareArenaButton.textContent = "Copied";
      setTimeout(() => {
        shareArenaButton.textContent = "Share";
      }, 1400);
    } catch (_) {
      // ignore
    }
  });

  focusModeButton?.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch (_) {
      // ignore
    }
  });
}

async function main() {
  const params = new URLSearchParams(window.location.search);
  let matchId = params.get("matchId");
  isDemoMode = params.get("demo") === "1";
  updateTopbar(isDemoMode ? "demo" : "live", matchId);
  updatePlaybackUi();
  bindDemoControls();
  bindQuickstart();
  bindShellActions();
  mountUnitRoster(document.getElementById("unitRoster"));

  if (isDemoMode) matchId = DEMO_MATCH_ID;

  if (!matchId && !isDemoMode) {
    try {
      const res = await fetch("/api/arena/matches?status=ended&limit=1", {
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        matchId = data.matches?.[0]?.matchId ?? data.matchId ?? null;
      }
    } catch (_) {
      // ignore
    }
    if (!matchId) matchId = "default-match";
    updateTopbar("live", matchId);
  }

  const svg = ensureSvg();
  resetEventLog(logEl);
  hideVictory();
  momentumHistory = [];

  const handlers = {
    onHello(frame) {
      updateTopbar(frame.mode === "demo" ? "demo" : "live", matchId);
      if (frame.projection) renderState(svg, viewStateFromProjection(frame.projection));
    },
    onState(frame) {
      renderState(svg, viewStateFromProjection(frame.projection));
    },
    onEvent(frame) {
      if (frame.projection) renderState(svg, viewStateFromProjection(frame.projection));
      appendEvent(logEl, frame.event ?? frame);
    },
    onEnd(frame) {
      if (frame.projection) renderState(svg, viewStateFromProjection(frame.projection));
      showVictory(frame.outcome?.winner ?? null, frame.outcome?.reason ?? "");
      if (isDemoMode) {
        isPaused = true;
        updatePlaybackUi();
      }
    },
    onError(err) {
      console.error("[arena] WebSocket error", err);
      autoplayEl.textContent = "Feed Error";
    },
  };

  currentConnection = isDemoMode ? playDemoReplay(handlers) : connectSpectator(matchId, handlers);
  if (isDemoMode) bindReplayKeyboard();

  window.__arenaDisconnect = () => {
    uninstallReplayKeyboard?.();
    currentConnection?.disconnect?.();
  };
}

main().catch((err) => console.error("[arena] bootstrap error", err));
