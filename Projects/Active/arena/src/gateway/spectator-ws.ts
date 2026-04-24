import type { Database } from "bun:sqlite";
import {
  buildSpectatorFrames,
  projectPublicMatch,
  projectLiveSpectatorMatch,
} from "../projection/public-match.ts";
import { adaptSpectatorSnapshot } from "../projection/live-match.ts";
import { getActiveRuntime } from "../orchestrator/match-runner.ts";
import { getMatch, streamEvents } from "../persistence/match-store";

type UpgradeServer = {
  [key: symbol]: ((req: Request, opts: { data: SpectatorSocketData }) => boolean) | undefined;
};

export interface SpectatorSocketData {
  kind: "spectator";
  matchId: string;
  frames: string[];
}

export interface SpectatorDeps {
  db: Database;
}

const SPECTATOR_PATH = /^\/api\/arena\/matches\/([^/]+)\/ws$/;

export function matchSpectatorPath(pathname: string): string | null {
  const match = SPECTATOR_PATH.exec(pathname);
  if (!match) return null;
  return decodeURIComponent(match[1]);
}

function getOperatorHandles(db: Database, matchId: string): { operatorA: string; operatorB: string } {
  const row = db
    .prepare(
      `SELECT oa.handle AS operatorA, ob.handle AS operatorB
       FROM matches m
       JOIN operators oa ON m.operator_a_id = oa.id
       JOIN operators ob ON m.operator_b_id = ob.id
       WHERE m.id = ?`,
    )
    .get(matchId) as { operatorA: string; operatorB: string } | undefined;
  return row ?? { operatorA: "Blue Horizon", operatorB: "Red Morrow" };
}

export function buildSpectatorFrameSequence(
  deps: SpectatorDeps,
  matchId: string,
): string[] | null {
  // Active match: use runtime truth
  const runtime = getActiveRuntime(matchId);
  if (runtime) {
    const snapshot = runtime.getSpectatorSnapshot();
    const input = adaptSpectatorSnapshot(snapshot);
    const projection = projectPublicMatch(input);
    return buildSpectatorFrames(projection).map((frame) => JSON.stringify(frame));
  }

  // Completed/replay match: fall back to DB path
  const match = getMatch(deps.db, matchId);
  if (!match) return null;
  const events = Array.from(streamEvents(deps.db, matchId));
  const handles = getOperatorHandles(deps.db, matchId);
  const projection = projectLiveSpectatorMatch({
    match,
    operatorA: handles.operatorA,
    operatorB: handles.operatorB,
    events,
  });
  return buildSpectatorFrames(projection).map((frame) => JSON.stringify(frame));
}

export function handleSpectatorWs(
  req: Request,
  server: unknown,
  matchId: string,
  deps: SpectatorDeps,
): Response {
  if (!req.headers.get("upgrade")?.toLowerCase().includes("websocket")) {
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }

  const frames = buildSpectatorFrameSequence(deps, matchId);
  if (!frames) {
    return new Response("Not Found", { status: 404 });
  }

  const upgraded = (server as UpgradeServer)[Symbol.for("upgrade")]?.(req, {
    data: { kind: "spectator", matchId, frames },
  });

  if (!upgraded) {
    return new Response("Upgrade failed", { status: 500 });
  }

  return new Response(null, { status: 101 });
}

export const spectatorWebSocket = {
  open(ws: WebSocket) {
    const data = (ws as WebSocket & { data?: SpectatorSocketData }).data;
    for (const frame of data?.frames ?? []) {
      ws.send(frame);
    }
    ws.close();
  },
};
