/**
 * Local UDS IPC server.
 * Transport: Bun.listen on a unix: socket. TCP is forbidden.
 * Socket permissions enforced to 0600 after bind.
 */

import { chmod, stat, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import type { Socket, SocketHandler } from "bun";
import {
  FrameReader,
  encodeFrame,
  type ErrorFrame,
  type Frame,
  type OpFrame,
  type ResultFrame,
  PROTOCOL_VERSION,
} from "./protocol";
import {
  AuthFailedError,
  loadAgentTokenMap,
  resolveAgent,
  type AgentTokenMap,
} from "./auth";
import { AccessDeniedError, type AgentContext } from "../memory/access-policy";
import { dispatchOp, UnknownOpError } from "../memory/ops/registry";

export class InvalidTransportError extends Error {
  constructor(transport: string) {
    super(`invalid transport: ${transport}`);
    this.name = "InvalidTransportError";
  }
}

const AUTH_TIMEOUT_MS = 2000;

interface ConnState {
  reader: FrameReader;
  agentCtx: AgentContext | null;
  authTimer: ReturnType<typeof setTimeout> | null;
}

function errorFrame(reqId: string, code: string, message: string): ErrorFrame {
  return { type: "error", version: PROTOCOL_VERSION, reqId, code, message };
}

function resultFrame(reqId: string, value: unknown): ResultFrame {
  return { type: "result", version: PROTOCOL_VERSION, reqId, value };
}

function writeFrame(socket: Socket<ConnState>, frame: Frame): void {
  socket.write(encodeFrame(frame));
}

async function handleOpFrame(
  socket: Socket<ConnState>,
  ctx: AgentContext,
  frame: OpFrame,
): Promise<void> {
  try {
    const value = await dispatchOp(frame.opName, frame.params, ctx);
    writeFrame(socket, resultFrame(frame.reqId, value));
  } catch (err) {
    const code = err instanceof UnknownOpError ? "unknown_op"
      : err instanceof AccessDeniedError ? "access_denied"
      : "internal_error";
    writeFrame(socket, errorFrame(frame.reqId, code, (err as Error).message));
  }
}

function processFrame(
  socket: Socket<ConnState>,
  frame: Frame,
  tokenMap: AgentTokenMap,
): void {
  const state = socket.data;
  if (!state.agentCtx) {
    if (frame.type !== "auth") {
      writeFrame(socket, errorFrame("", "auth_required", "first frame must be auth"));
      socket.end();
      return;
    }
    try {
      state.agentCtx = resolveAgent(frame.token, tokenMap);
      if (state.authTimer) clearTimeout(state.authTimer);
      state.authTimer = null;
    } catch (err) {
      const code = err instanceof AuthFailedError ? "auth_failed" : "auth_error";
      writeFrame(socket, errorFrame("", code, (err as Error).message));
      socket.end();
    }
    return;
  }
  if (frame.type !== "op") {
    writeFrame(socket, errorFrame("", "protocol_error", `unexpected frame type ${frame.type}`));
    socket.end();
    return;
  }
  void handleOpFrame(socket, state.agentCtx, frame);
}

function buildHandler(tokenMap: AgentTokenMap): SocketHandler<ConnState> {
  return {
    open(socket) {
      socket.data = {
        reader: new FrameReader(),
        agentCtx: null,
        authTimer: setTimeout(() => {
          writeFrame(socket, errorFrame("", "auth_timeout", "auth deadline exceeded"));
          socket.end();
        }, AUTH_TIMEOUT_MS),
      };
    },
    data(socket, bytes) {
      let frames: Frame[];
      try { frames = socket.data.reader.push(new Uint8Array(bytes)); }
      catch (err) {
        writeFrame(socket, errorFrame("", "frame_error", (err as Error).message));
        socket.end();
        return;
      }
      for (const frame of frames) processFrame(socket, frame, tokenMap);
    },
    close(socket) {
      if (socket.data?.authTimer) clearTimeout(socket.data.authTimer);
    },
  };
}

function assertUnixPath(path: string): string {
  if (!path.startsWith("unix:")) throw new InvalidTransportError(path);
  return path.slice("unix:".length);
}

/**
 * Normalize a transport input to `unix:/absolute/path`.
 * Accepts either a bare absolute path or an already-prefixed `unix:` form.
 * Rejects relative paths and non-unix schemes (e.g. tcp://).
 */
export function resolveTransport(input: string): string {
  if (input.startsWith("unix:")) return input;
  if (input.startsWith("/")) return `unix:${input}`;
  throw new InvalidTransportError(input);
}

async function enforceDirPerms(path: string): Promise<void> {
  const dir = dirname(path);
  const st = await stat(dir).catch(() => null);
  if (!st) throw new Error(`socket parent dir missing: ${dir}`);
  if (dir === "/tmp") return;
  const mode = st.mode & 0o777;
  if (mode !== 0o700) throw new Error(`socket parent dir mode must be 0700, got ${mode.toString(8)}`);
}

export interface IpcServerOptions {
  readonly transport: string; // "unix:/absolute/path"
  readonly tokenMapPath: string;
}

export interface IpcServerHandle {
  readonly socketPath: string;
  stop(): Promise<void>;
}

export async function startIpcServer(opts: IpcServerOptions): Promise<IpcServerHandle> {
  const socketPath = assertUnixPath(resolveTransport(opts.transport));
  await enforceDirPerms(socketPath);
  await unlink(socketPath).catch(() => undefined);
  const tokenMap = await loadAgentTokenMap(opts.tokenMapPath);
  const server = Bun.listen<ConnState>({
    unix: socketPath,
    socket: buildHandler(tokenMap),
  });
  await chmod(socketPath, 0o600);
  return {
    socketPath,
    async stop() {
      server.stop();
      await unlink(socketPath).catch(() => undefined);
    },
  };
}
