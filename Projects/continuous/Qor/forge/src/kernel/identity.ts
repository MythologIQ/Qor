import { ContinuumClient } from "../../../continuum/client";

export const FORGE_IDENTITY = {
  agentId: "forge",
  ipcToken: process.env.FORGE_KERNEL_TOKEN ?? "",
} as const;

let client: ContinuumClient | null = null;

export function getForgeClient(): ContinuumClient {
  if (!client) {
    if (!FORGE_IDENTITY.ipcToken) throw new Error("FORGE_KERNEL_TOKEN not set");
    client = ContinuumClient.create({
      socketPath: process.env.QOR_IPC_SOCKET ?? "/tmp/qor.sock",
      token: FORGE_IDENTITY.ipcToken,
    });
  }
  return client;
}
