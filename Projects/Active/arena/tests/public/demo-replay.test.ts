import { describe, expect, test } from "bun:test";
import { buildDemoFrames } from "../../src/public/demo-replay.js";

describe("demo replay", () => {
  test("builds a deterministic explicit demo sequence", () => {
    const frames = buildDemoFrames();
    const lastFrame = frames.at(-1) as { type: string; outcome?: { winner?: string } } | undefined;
    expect(frames.length).toBeGreaterThan(24); // 12 rounds → 25 total frames: HELLO + 11 STATE + 12 EVENT + END
    expect(frames[0]?.type).toBe("MATCH_HELLO");
    expect(frames[0]?.mode).toBe("demo");
    expect(frames[0]?.matchId).toBe("demo-siege-at-kestrel-gate");
    expect(lastFrame?.type).toBe("MATCH_END");
    expect(lastFrame?.outcome?.winner).toBe("A");
  });

  test("emits projection-backed MATCH_* playback", () => {
    const frames = buildDemoFrames();
    const stateFrames = frames.filter((frame) => frame.type === "MATCH_STATE") as unknown as Array<{
      type: "MATCH_STATE";
      projection: {
        sides: { A: { reasoning: Array<{ text: string }> } };
        roundCap: number;
      };
    }>;
    const eventFrames = frames.filter((frame) => frame.type === "MATCH_EVENT") as unknown as Array<{
      type: "MATCH_EVENT";
      event: { headline: string };
      projection: { matchId: string };
    }>;
    const tailState = frames.at(-1) as { projection?: { roundCap: number } } | undefined;
    expect(stateFrames.length).toBeGreaterThan(10); // 12 rounds: STATE at index > 0 → 11 STATE frames
    expect(eventFrames.length).toBeGreaterThan(11); // 12 EVENT frames (one per round)
    expect(stateFrames[0]?.projection.sides.A.reasoning[0]?.text.length).toBeGreaterThan(10);
    expect(eventFrames[0]?.event.headline.length).toBeGreaterThan(10);
    expect(eventFrames[0]?.projection.matchId).toBe("demo-siege-at-kestrel-gate");
    expect(tailState?.projection?.roundCap).toBe(50);
  });
});
