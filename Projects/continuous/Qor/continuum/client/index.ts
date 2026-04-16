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

  call<T = unknown>(opName: string, params: unknown): Promise<T> {
    return this.ipc.call<T>(opName, params);
  }

  async close(): Promise<void> {
    await this.ipc.close();
  }
}
