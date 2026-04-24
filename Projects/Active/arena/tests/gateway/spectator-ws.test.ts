import { beforeEach, describe, expect, test } from "bun:test";
import { openDb, initDb } from "../../src/persistence/db";
import { seedDemoMatch, DEMO_SEED_MATCH_ID } from "../../src/persistence/seed";
import {
  buildSpectatorFrameSequence,
  handleSpectatorWs,
  matchSpectatorPath,
} from "../../src/gateway/spectator-ws.ts";

describe("spectator websocket", () => {
  let db: ReturnType<typeof openDb>;

  beforeEach(() => {
    db = openDb(":memory:");
    initDb(db);
    seedDemoMatch(db);
  });

  test("canonical spectator path matches and legacy query path does not", () => {
    expect(matchSpectatorPath(`/api/arena/matches/${DEMO_SEED_MATCH_ID}/ws`)).toBe(DEMO_SEED_MATCH_ID);
    expect(matchSpectatorPath(`/api/arena/ws?spectate=${DEMO_SEED_MATCH_ID}`)).toBeNull();
  });

  test("frame sequence uses MATCH_* family and projection only", () => {
    const frames = buildSpectatorFrameSequence({ db }, DEMO_SEED_MATCH_ID);
    expect(frames).not.toBeNull();
    const decoded = frames!.map((frame) => JSON.parse(frame));
    expect(decoded[0].type).toBe("MATCH_HELLO");
    expect(decoded[1].type).toBe("MATCH_STATE");
    expect(decoded.some((frame) => frame.type === "MATCH_EVENT")).toBe(true);
    expect(decoded.at(-1)?.type).toBe("MATCH_END");
    expect(decoded.every((frame) => frame.projection)).toBe(true);
    expect(decoded.every((frame) => frame.visible === undefined)).toBe(true);
    expect(decoded.every((frame) => frame.units === undefined)).toBe(true);
    expect(decoded.every((frame) => frame.score === undefined)).toBe(true);
    expect(decoded.every((frame) => frame.deadline === undefined)).toBe(true);
    expect(decoded.every((frame) => frame.budget === undefined)).toBe(true);
  });

  test("upgrade handler accepts canonical path and rejects unknown match", async () => {
    const upgrades: Array<{ matchId: string }> = [];
    const req = new Request(`http://arena.test/api/arena/matches/${DEMO_SEED_MATCH_ID}/ws`, {
      headers: { Upgrade: "websocket" },
    });
    const server = {
      [Symbol.for("upgrade")]: (_request: Request, opts: { data: { matchId: string } }) => {
        upgrades.push({ matchId: opts.data.matchId });
        return true;
      },
    };
    const accepted = await handleSpectatorWs(req, server, DEMO_SEED_MATCH_ID, { db });
    expect(accepted.status).toBe(101);
    expect(upgrades[0]?.matchId).toBe(DEMO_SEED_MATCH_ID);

    const missing = await handleSpectatorWs(req, server, "nope", { db });
    expect(missing.status).toBe(404);
  });
});
