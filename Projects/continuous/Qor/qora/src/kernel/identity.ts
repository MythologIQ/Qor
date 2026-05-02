import { ContinuumClient } from "../../../continuum/client";

export const QORA_IDENTITY = {
  agentId: "qora",
  ipcToken: process.env.QORA_KERNEL_TOKEN ?? "",
} as const;

let client: ContinuumClient | null = null;

export function getQoraClient(): ContinuumClient {
  if (!client) {
    if (!QORA_IDENTITY.ipcToken) throw new Error("QORA_KERNEL_TOKEN not set");
    client = ContinuumClient.create({
      socketPath: process.env.QOR_IPC_SOCKET ?? "/tmp/qor.sock",
      token: QORA_IDENTITY.ipcToken,
    });
  }
  return client;
}
