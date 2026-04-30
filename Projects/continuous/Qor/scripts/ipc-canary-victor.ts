/**
 * scripts/ipc-canary-victor.ts — Victor IPC roundtrip canary.
 * Constructs ContinuumClient with VICTOR_KERNEL_TOKEN, invokes events.execution.query
 * with {filter:{limit:1}}, asserts OK response (may be empty array).
 * Empty-result success proves auth + routing + ACL roundtrip.
 * Exit 0 on success, 1 on failure.
 */
import { ContinuumClient } from "../continuum/client";

const SOCKET_PATH = process.env.QOR_IPC_SOCKET ?? "/tmp/qor.sock";
const TOKEN = process.env.VICTOR_KERNEL_TOKEN;

if (!TOKEN) {
  process.stderr.write("FATAL: VICTOR_KERNEL_TOKEN env required\n");
  process.exit(1);
}

async function main(): Promise<void> {
  const client = ContinuumClient.create({ socketPath: SOCKET_PATH, token: TOKEN });
  try {
    const result = await client.call<unknown[]>("events.execution.query", {
      filter: { limit: 1 },
    });
    if (!Array.isArray(result)) {
      throw new Error(`expected array, got ${typeof result}`);
    }
    process.stdout.write(`PASS: Victor IPC roundtrip OK (${(result as unknown[]).length} entries)\n`);
  } finally {
    await client.close().catch(() => {});
  }
}

main().catch((err) => {
  process.stderr.write(`FAIL: ${(err as Error).message}\n`);
  process.exit(1);
});
