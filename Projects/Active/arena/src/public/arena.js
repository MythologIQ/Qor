import { renderBoard } from "./hex-render.js?v=20260418d3";
import { applyFog, clearFog } from "./fog-overlay.js?v=20260418d3";
import { renderUnits } from "./unit-render.js?v=20260418d3";
import { appendEvent, resetEventLog } from "./event-log.js?v=20260418d3";
import { updateScore } from "./score.js?v=20260418d3";
import { updateAgentStatus } from "./agent-status.js?v=20260418d3";
import { updateReasoningPanel } from "./reasoning-panel.js?v=20260418d3";
import { connectSpectator } from "./ws-client.js?v=20260418d3";
import { DEMO_MATCH_ID, playDemoReplay } from "./demo-replay.js?v=20260418d3";

const boardEl = document.getElementById("board");
const logEl = document.getElementById("eventLog");
const scoreEl = document.getElementById("score");
const agentEl = document.getElementById("agentStatus");
const reasonEl = document.getElementById("reasoningPanel");
const badgeEl = document.getElementById("modeBadge");
const headlineEl = document.getElementById("headline");
const phaseEl = document.getElementById("phasePill");
const pressureEl = document.getElementById("pressureValue");
const featuredEventEl = document.getElementById("featuredEvent");
const progressFillEl = document.getElementById("progressFill");
const progressLabelEl = document.getElementById("progressLabel");
const timelineEl = document.getElementById("timeline");
const turnTickerEl = document.getElementById("turnTicker");
const autoplayEl = document.getElementById("autoplayStatus");
const restartButton = document.getElementById("restartDemo");
const toggleButton = document.getElementById("togglePlayback");

let currentConnection = null;
let isDemoMode = false;
let isPaused = false;
let latestTurn = 0;
let latestTurnCap = 0;

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

function applyFogForState(svg, state) {
  const fogCells = defaultVisibleCells();
  clearFog(svg);
  if (fogCells) {
    applyFog(svg, fogCells, "both");
  }
}

function updateModeBadge(mode, matchId) {
  if (!badgeEl) return;
  if (mode === "demo") {
    badgeEl.textContent = "Demo Broadcast";
    badgeEl.dataset.mode = "demo";
    return;
  }
  badgeEl.textContent = matchId ? `Live Match ${matchId}` : "Live Arena";
  badgeEl.dataset.mode = "live";
}

function updateChrome(state) {
  latestTurn = state.turn ?? latestTurn;
  latestTurnCap = state.turnCap ?? latestTurnCap;
  headlineEl.textContent = state.headline ?? "Awaiting opening exchange.";
  phaseEl.textContent = state.phase ?? "Spectator Feed";
  featuredEventEl.textContent = state.featuredEvent ?? "No featured event yet.";
  const pressure = Math.max(0, Math.min(100, state.pressure ?? 0));
  pressureEl.textContent = `${pressure}%`;
  pressureEl.style.setProperty("--pressure", `${pressure}%`);

  const progress = latestTurnCap > 0 ? Math.max(0, Math.min(100, (latestTurn / latestTurnCap) * 100)) : 0;
  progressFillEl.style.width = `${progress}%`;
  progressLabelEl.textContent = latestTurnCap > 0 ? `Turn ${latestTurn} of ${latestTurnCap}` : "No turn data";
  turnTickerEl.textContent = latestTurnCap > 0 ? `${latestTurn}/${latestTurnCap}` : "--/--";
}

function renderTimeline(state) {
  if (!timelineEl || !state.turnCap) return;
  timelineEl.replaceChildren();
  for (let i = 1; i <= state.turnCap; i += 1) {
    const marker = document.createElement("div");
    marker.className = "timeline-marker";
    marker.textContent = String(i).padStart(2, "0");
    if (i < state.turn) marker.dataset.state = "past";
    if (i === state.turn) marker.dataset.state = "current";
    timelineEl.appendChild(marker);
  }
}

function renderState(svg, state) {
  renderBoard(svg, state.board ?? [], state);
  updateScore(scoreEl, {
    a: state.territories?.A ?? 0,
    b: state.territories?.B ?? 0,
    turn: state.turn ?? 0,
    turnCap: state.turnCap ?? 50,
    phase: state.phase ?? "Spectator Feed",
  });
  updateAgentStatus(agentEl, state.agents ?? []);
  updateReasoningPanel(reasonEl, state.reasoning ?? []);
  updateChrome(state);
  renderTimeline(state);
  applyFogForState(svg, state);
  renderUnits(svg, state.units ?? []);
}

function updatePlaybackUi() {
  const active = isDemoMode ? (isPaused ? "Paused" : "Autoplay") : "Live Socket";
  autoplayEl.textContent = active;
  toggleButton.hidden = !isDemoMode;
  restartButton.hidden = !isDemoMode;
  toggleButton.textContent = isPaused ? "Resume Demo" : "Pause Demo";
}

function bindDemoControls() {
  restartButton.onclick = () => {
    currentConnection?.restart?.();
    hideVictory();
    resetEventLog(logEl);
    isPaused = false;
    updatePlaybackUi();
  };
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

async function main() {
  const params = new URLSearchParams(window.location.search);
  let matchId = params.get("matchId");
  isDemoMode = params.get("demo") === "1";
  updateModeBadge(isDemoMode ? "demo" : "live", matchId);
  updatePlaybackUi();
  bindDemoControls();

  if (isDemoMode) {
    matchId = DEMO_MATCH_ID;
  }

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
      // no-op
    }
    if (!matchId) {
      matchId = "default-match";
    }
  }

  const svg = ensureSvg();
  resetEventLog(logEl);
  hideVictory();

  const handlers = {
    onHello(frame) {
      updateModeBadge(frame.mode === "demo" ? "demo" : "live", matchId);
      if (frame.state) renderState(svg, frame.state);
    },
    onState(frame) {
      renderState(svg, frame.state);
    },
    onEvent(frame) {
      appendEvent(logEl, frame.event ?? frame);
      if (frame.event?.detail) {
        featuredEventEl.textContent = frame.event.detail;
      }
    },
    onEnd(frame) {
      if (frame.state) renderState(svg, frame.state);
      showVictory(frame.winner ?? null, frame.reason ?? "");
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

  currentConnection = isDemoMode
    ? playDemoReplay(handlers)
    : connectSpectator(matchId, handlers);

  window.__arenaDisconnect = () => currentConnection?.disconnect?.();
}

main().catch((err) => console.error("[arena] bootstrap error", err));
