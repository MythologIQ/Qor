/**
 * Continuum client facade. Consumed by kernels (Victor, Qora, Forge).
 * Typed wrapper over IpcClient. Op names mirror memory/ops/registry OP_TABLE.
 */

import { IpcClient, IpcClientError, type IpcClientOptions } from "../src/ipc/client";

export { IpcClient, IpcClientError };
export type { IpcClientOptions };

export class ContinuumClient {
  constructor(private readonly ipc: IpcClient) {}

  static create(opts: IpcClientOptions): ContinuumClient {
    return new ContinuumClient(new IpcClient(opts));
  }

  /**
   * Construct a client from environment variables.
   * Socket path: QOR_IPC_SOCKET (bare path) → CONTINUUM_IPC_TRANSPORT (legacy, may have unix: prefix).
   * Token: QOR_IPC_TOKEN (required).
   * Throws IpcClientError("config", ...) if either is missing.
   */
  static fromEnv(): ContinuumClient {
    const raw = process.env.QOR_IPC_SOCKET ?? process.env.CONTINUUM_IPC_TRANSPORT;
    if (!raw) throw new IpcClientError("config", "QOR_IPC_SOCKET (or legacy CONTINUUM_IPC_TRANSPORT) not set");
    const token = process.env.QOR_IPC_TOKEN;
    if (!token) throw new IpcClientError("config", "QOR_IPC_TOKEN not set");
    const socketPath = raw.startsWith("unix:") ? raw.slice("unix:".length) : raw;
    return ContinuumClient.create({ socketPath, token });
  }

  call<T = unknown>(opName: string, params: unknown): Promise<T> {
    return this.ipc.call<T>(opName, params);
  }

  async close(): Promise<void> {
    await this.ipc.close();
  }
}
