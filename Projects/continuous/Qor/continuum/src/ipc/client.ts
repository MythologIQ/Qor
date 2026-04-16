/**
 * UDS IPC client. Used by kernels to reach Continuum.
 * Sends auth frame first. Correlates responses via reqId. Auto-reconnect with backoff.
 */

import type { Socket, SocketHandler } from "bun";
import {
  FrameReader,
  encodeFrame,
  type AuthFrame,
  type Frame,
  type OpFrame,
  PROTOCOL_VERSION,
} from "./protocol";

export class IpcClientError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "IpcClientError";
  }
}

export interface IpcClientOptions {
  readonly socketPath: string;
  readonly token: string;
  readonly reconnectBaseMs?: number;
  readonly reconnectMaxMs?: number;
}

interface Pending {
  readonly resolve: (value: unknown) => void;
  readonly reject: (err: Error) => void;
}

interface ConnData {
  client: IpcClient;
}

export class IpcClient {
  private socket: Socket<ConnData> | null = null;
  private reader = new FrameReader();
  private pending = new Map<string, Pending>();
  private reqCounter = 0;
  private reconnectAttempts = 0;
  private closed = false;
  private connecting: Promise<void> | null = null;

  constructor(private readonly opts: IpcClientOptions) {}

  private get baseMs(): number { return this.opts.reconnectBaseMs ?? 100; }
  private get maxMs(): number { return this.opts.reconnectMaxMs ?? 5000; }

  async connect(): Promise<void> {
    if (this.socket) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.doConnect();
    try { await this.connecting; } finally { this.connecting = null; }
  }

  private async doConnect(): Promise<void> {
    const handler: SocketHandler<ConnData> = {
      open: (socket) => {
        const authFrame: AuthFrame = { type: "auth", version: PROTOCOL_VERSION, token: this.opts.token };
        socket.write(encodeFrame(authFrame));
        this.reconnectAttempts = 0;
      },
      data: (socket, bytes) => {
        let frames: Frame[];
        try { frames = this.reader.push(new Uint8Array(bytes)); }
        catch (err) { this.failAll(new IpcClientError("frame_error", (err as Error).message)); socket.end(); return; }
        for (const f of frames) this.dispatchFrame(f);
      },
      close: () => { this.onDisconnect(); },
      error: (_, _err) => { this.onDisconnect(); },
    };
    this.socket = await Bun.connect<ConnData>({
      unix: this.opts.socketPath,
      socket: handler,
    });
    this.socket.data = { client: this };
  }

  private dispatchFrame(frame: Frame): void {
    if (frame.type !== "result" && frame.type !== "error") return;
    const pending = this.pending.get(frame.reqId);
    if (!pending) return;
    this.pending.delete(frame.reqId);
    if (frame.type === "error") {
      pending.reject(new IpcClientError(frame.code, frame.message));
    } else {
      pending.resolve(frame.value);
    }
  }

  private failAll(err: Error): void {
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }

  private onDisconnect(): void {
    this.socket = null;
    this.reader = new FrameReader();
    if (this.closed) return;
    this.failAll(new IpcClientError("disconnected", "server closed connection"));
    const delay = Math.min(this.maxMs, this.baseMs * 2 ** this.reconnectAttempts);
    this.reconnectAttempts++;
    setTimeout(() => { if (!this.closed) void this.connect().catch(() => undefined); }, delay);
  }

  async call<T = unknown>(opName: string, params: unknown): Promise<T> {
    if (this.closed) throw new IpcClientError("closed", "client closed");
    await this.connect();
    const reqId = `r-${++this.reqCounter}`;
    const frame: OpFrame = { type: "op", version: PROTOCOL_VERSION, reqId, opName, params };
    return new Promise<T>((resolve, reject) => {
      this.pending.set(reqId, { resolve: (v) => resolve(v as T), reject });
      if (!this.socket) { reject(new IpcClientError("disconnected", "no socket")); return; }
      this.socket.write(encodeFrame(frame));
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.socket) {
      this.socket.end();
      this.socket = null;
    }
    this.failAll(new IpcClientError("closed", "client closed"));
  }
}
