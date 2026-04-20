import { describe, expect, test } from "bun:test";
import { buildDemoFrames } from "../../src/public/demo-replay.js";

describe("demo replay", () => {
  test("builds a deterministic explicit demo sequence", () => {
    const frames = buildDemoFrames();
    expect(frames.length).toBeGreaterThan(30);
    expect(frames[0]?.type).toBe("HELLO");
    expect(frames[0]?.mode).toBe("demo");
    expect(frames[0]?.matchId).toBe("demo-siege-at-kestrel-gate");
    expect(frames.at(-1)?.type).toBe("END");
    expect(frames.at(-1)?.winner).toBe("A");
  });

  test("includes intermediate state and event playback", () => {
    const frames = buildDemoFrames();
    const stateFrames = frames.filter((frame) => frame.type === "STATE");
    const eventFrames = frames.filter((frame) => frame.type === "EVENT");
    expect(stateFrames.length).toBeGreaterThan(12);
    expect(eventFrames.length).toBeGreaterThan(12);
    expect(stateFrames[0]?.state.reasoning.length).toBe(2);
    expect(eventFrames[0]?.event.move.length).toBeGreaterThan(10);
    expect(frames.at(-1)?.state.turnCap).toBe(18);
  });
});
