import { describe, it, expect } from "bun:test";
import {
  encodeFrame,
  decodeFrame,
  FrameReader,
  FrameDecodeError,
  PROTOCOL_VERSION,
  type AuthFrame,
  type OpFrame,
  type ResultFrame,
  type ErrorFrame,
} from "../../src/ipc/protocol";

const auth: AuthFrame = { type: "auth", version: PROTOCOL_VERSION, token: "t" };
const op: OpFrame = { type: "op", version: PROTOCOL_VERSION, reqId: "r1", opName: "x.y", params: { k: "v" } };
const result: ResultFrame = { type: "result", version: PROTOCOL_VERSION, reqId: "r1", value: 42 };
const err: ErrorFrame = { type: "error", version: PROTOCOL_VERSION, reqId: "r1", code: "bad", message: "fail" };

describe("ipc/protocol", () => {
  it.each([
    ["auth", auth],
    ["op", op],
    ["result", result],
    ["error", err],
  ])("round-trips %s frame", (_name, frame) => {
    const bytes = encodeFrame(frame);
    expect(decodeFrame(bytes)).toEqual(frame);
  });

  it("rejects truncated length prefix", () => {
    expect(() => decodeFrame(new Uint8Array([0, 0]))).toThrow(FrameDecodeError);
  });

  it("rejects version mismatch", () => {
    const bogus = { ...op, version: 999 };
    const body = new TextEncoder().encode(JSON.stringify(bogus));
    const out = new Uint8Array(4 + body.byteLength);
    new DataView(out.buffer).setUint32(0, body.byteLength, true);
    out.set(body, 4);
    expect(() => decodeFrame(out)).toThrow(/version/);
  });

  it("rejects invalid JSON body", () => {
    const body = new TextEncoder().encode("{not json");
    const out = new Uint8Array(4 + body.byteLength);
    new DataView(out.buffer).setUint32(0, body.byteLength, true);
    out.set(body, 4);
    expect(() => decodeFrame(out)).toThrow(/invalid JSON/);
  });

  describe("FrameReader", () => {
    it("emits complete frames from a single chunk", () => {
      const reader = new FrameReader();
      const bytes = encodeFrame(op);
      expect(reader.push(bytes)).toEqual([op]);
    });

    it("assembles frames split across chunks", () => {
      const reader = new FrameReader();
      const bytes = encodeFrame(op);
      const a = bytes.subarray(0, 6);
      const b = bytes.subarray(6);
      expect(reader.push(a)).toEqual([]);
      expect(reader.push(b)).toEqual([op]);
    });

    it("emits multiple frames when concatenated in one chunk", () => {
      const reader = new FrameReader();
      const combined = new Uint8Array([...encodeFrame(op), ...encodeFrame(result)]);
      expect(reader.push(combined)).toEqual([op, result]);
    });
  });
});
