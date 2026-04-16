/**
 * Framed IPC protocol.
 * Wire format: u32-LE length prefix + JSON body.
 * Frame types are discriminated by `type`. `version` gates future upgrades.
 */

export const PROTOCOL_VERSION = 1;
export const MAX_FRAME_BYTES = 4 * 1024 * 1024;

export type FrameType = "auth" | "op" | "result" | "error";

export interface AuthFrame {
  readonly type: "auth";
  readonly version: number;
  readonly token: string;
}

export interface OpFrame {
  readonly type: "op";
  readonly version: number;
  readonly reqId: string;
  readonly opName: string;
  readonly params: unknown;
}

export interface ResultFrame {
  readonly type: "result";
  readonly version: number;
  readonly reqId: string;
  readonly value: unknown;
}

export interface ErrorFrame {
  readonly type: "error";
  readonly version: number;
  readonly reqId: string;
  readonly code: string;
  readonly message: string;
}

export type Frame = AuthFrame | OpFrame | ResultFrame | ErrorFrame;

export class FrameDecodeError extends Error {
  constructor(reason: string) {
    super(`frame decode: ${reason}`);
    this.name = "FrameDecodeError";
  }
}

export function encodeFrame(frame: Frame): Uint8Array {
  const json = JSON.stringify(frame);
  const body = new TextEncoder().encode(json);
  if (body.byteLength > MAX_FRAME_BYTES) {
    throw new FrameDecodeError(`frame too large: ${body.byteLength}`);
  }
  const out = new Uint8Array(4 + body.byteLength);
  new DataView(out.buffer).setUint32(0, body.byteLength, true);
  out.set(body, 4);
  return out;
}

export function decodeFrame(bytes: Uint8Array): Frame {
  if (bytes.byteLength < 4) throw new FrameDecodeError("truncated length prefix");
  const len = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true);
  if (len === 0 || len > MAX_FRAME_BYTES) throw new FrameDecodeError(`invalid length ${len}`);
  if (bytes.byteLength < 4 + len) throw new FrameDecodeError("truncated body");
  const body = new TextDecoder().decode(bytes.subarray(4, 4 + len));
  let parsed: unknown;
  try { parsed = JSON.parse(body); }
  catch { throw new FrameDecodeError("invalid JSON"); }
  if (!parsed || typeof parsed !== "object") throw new FrameDecodeError("body not object");
  const f = parsed as Record<string, unknown>;
  if (f.version !== PROTOCOL_VERSION) throw new FrameDecodeError(`version ${f.version}`);
  if (f.type !== "auth" && f.type !== "op" && f.type !== "result" && f.type !== "error") {
    throw new FrameDecodeError(`unknown type ${String(f.type)}`);
  }
  return parsed as Frame;
}

/**
 * Stream reader. Feed incoming chunks; yields complete frames.
 * Retains partial bytes across calls.
 */
export class FrameReader {
  private buf: Uint8Array = new Uint8Array(0);

  push(chunk: Uint8Array): Frame[] {
    const combined = new Uint8Array(this.buf.byteLength + chunk.byteLength);
    combined.set(this.buf, 0);
    combined.set(chunk, this.buf.byteLength);
    this.buf = combined;

    const frames: Frame[] = [];
    while (this.buf.byteLength >= 4) {
      const len = new DataView(this.buf.buffer, this.buf.byteOffset, this.buf.byteLength).getUint32(0, true);
      if (len === 0 || len > MAX_FRAME_BYTES) throw new FrameDecodeError(`invalid length ${len}`);
      if (this.buf.byteLength < 4 + len) break;
      frames.push(decodeFrame(this.buf.subarray(0, 4 + len)));
      this.buf = this.buf.subarray(4 + len);
    }
    return frames;
  }
}
