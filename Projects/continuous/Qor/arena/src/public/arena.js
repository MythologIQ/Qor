/**
 * arena.js — HexaWars Spectator Bootstrapper (task-066-arena-main)
 * Wires: on page load, parse ?matchId from URL (or fetch latest),
 * connect, renderBoard, applyFog, renderUnits on STATE,
 * appendEvent on EVENT, END shows victory banner.
 */
import { renderBoard } from "./hex-render.js";
import { applyFog, clearFog } from "./fog-overlay.js";
import { renderUnits } from "./unit-render.js";
import { appendEvent } from "./event-log.js";
import { updateScore } from "./score.js";
import { updateAgentStatus } from "./agent-status.js";
import { updateReasoningPanel } from "./reasoning-panel.js";
import { connectSpectator, FRAME_TYPES } from "./ws-client.js";

const boardEl    = document.getElementById("board");
const logEl      = document.getElementById("eventLog");
const scoreEl   = document.getElementById("score");
const agentEl   = document.getElementById("agentStatus");
const reasonEl  = document.getElementById("reasoningPanel");

// ── Derive board SVG element ────────────────────────────────────────────────
function ensureSvg() {
  let svg = boardEl.querySelector("svg");
  if (!svg) {
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("id", "arena-svg");
    boardEl.appendChild(svg);
  }
  return svg;
}

// ── Victory banner ─────────────────────────────────────────────────────────
function showVictory(winner) {
  const existing = document.getElementById("victory-banner");
  if (existing) return;
  const banner = document.createElement("div");
  banner.id = "victory-banner";
  banner.style.cssText = [
    "position:fixed",
    "inset:0",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "background:rgba(0,0,0,0.75)",
    "z-index:1000",
  ].join(";");
  const inner = document.createElement("div");
  inner.style.cssText = [
    "padding:2rem 3rem",
    "background:#111118",
    "border-radius:12px",
    "border:2px solid " + (winner === "A" ? "#3b82f6" : winner === "B" ? "#ef4444" : "#888"),
    "text-align:center",
    "font-size:1.75rem",
    "font-weight:700",
    "color:" + (winner === "A" ? "#60a5fa" : winner === "B" ? "#f87171" : "#ccc"),
  ].join(";");
  inner.textContent = winner === "A" ? "Blue Wins!" : winner === "B" ? "Red Wins!" : "Draw — No Victor";
  banner.appendChild(inner);
  document.body.appendChild(banner);
}

// ── Visible-cell computation ────────────────────────────────────────────────
// For a real game, visibleCells would come from an END-frame or agent state.
// We derive a simple default here so the page renders correctly without a live match.
function defaultVisibleCells() {
  // Flat-board approximation: all cells on a small board are visible to a spectator.
  return null; // null signals "no fog" to applyFog.
}

function applyFogForState(svg, state) {
  // Spectators see both players' fog — pass 'both' so only explicitly-hidden cells fog.
  const fogCells = defaultVisibleCells();
  clearFog(svg);
  if (fogCells) {
    applyFog(svg, fogCells, "both");
  }
}

// ── Main bootstrap ──────────────────────────────────────────────────────────
async function main() {
  const params = new URLSearchParams(window.location.search);
  let matchId = params.get("matchId");

  // If no matchId given, fetch the latest concluded match id from the arena API.
  if (!matchId) {
    try {
      const res = await fetch("/api/arena/matches?status=ended&limit=1");
      if (res.ok) {
        const data = await res.json();
        matchId = data.matches?.[0]?.matchId ?? data.matchId ?? null;
      }
    } catch (_) {
      // arena API may not be running in dev — silently skip.
    }
    if (!matchId) {
      matchId = "default-match";
    }
  }

  const svg = ensureSvg();

  const conn = connectSpectator(matchId, {
    onHello(frame) {
      // Frame carries initial state and board info.
      if (frame.state) {
        renderBoard(svg, frame.state.board ?? []);
        updateScore(scoreEl, {
          a: frame.state.territories?.A ?? 0,
          b: frame.state.territories?.B ?? 0,
          turn: frame.state.turn ?? 0,
          turnCap: frame.state.turnCap ?? 50,
        });
        updateAgentStatus(agentEl, frame.state.agents ?? []);
        updateReasoningPanel(reasonEl, frame.state.reasoning ?? []);
        applyFogForState(svg, frame.state);
        renderUnits(svg, frame.state.units ?? []);
      }
    },

    onState(frame) {
      renderBoard(svg, frame.state.board ?? []);
      updateScore(scoreEl, {
        a: frame.state.territories?.A ?? 0,
        b: frame.state.territories?.B ?? 0,
        turn: frame.state.turn ?? 0,
        turnCap: frame.state.turnCap ?? 50,
      });
      updateAgentStatus(agentEl, frame.state.agents ?? []);
      updateReasoningPanel(reasonEl, frame.state.reasoning ?? []);
      applyFogForState(svg, frame.state);
      renderUnits(svg, frame.state.units ?? []);
    },

    onEvent(frame) {
      appendEvent(logEl, frame.event ?? frame);
    },

    onEnd(frame) {
      const winner = frame.winner ?? null;
      showVictory(winner);
      // Final state if provided
      if (frame.state) {
        renderBoard(svg, frame.state.board ?? []);
        updateScore(scoreEl, {
          a: frame.state.territories?.A ?? 0,
          b: frame.state.territories?.B ?? 0,
          turn: frame.state.turn ?? 0,
          turnCap: frame.state.turnCap ?? 50,
        });
        updateAgentStatus(agentEl, frame.state.agents ?? []);
        updateReasoningPanel(reasonEl, frame.state.reasoning ?? []);
        renderUnits(svg, frame.state.units ?? []);
      }
    },

    onError(err) {
      console.error("[arena] WebSocket error", err);
    },
  });

  // Expose disconnect for cleanup / hot-reload
  window.__arenaDisconnect = () => conn.disconnect();
}

main().catch((err) => console.error("[arena] bootstrap error", err));
