import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { recordVeto } from "../src/api/record-veto";
import { PATHS, parseLedger } from "../src/api/status";

const ORIGINAL_LEDGER = PATHS.ledgerPath;
const TEST_DIR = "/tmp/qora-test-veto";
const TEST_LEDGER = `${TEST_DIR}/ledger.jsonl`;
const SECRET_PATH = "/home/workspace/Projects/continuous/Qor/qora/.secrets/api_key";

function getSecret(): string {
  return readFileSync(SECRET_PATH, "utf-8").trim();
}

describe("recordVeto", () => {
  beforeEach(() => {
    if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
    (PATHS as any).ledgerPath = TEST_LEDGER;
    if (existsSync(TEST_LEDGER)) rmSync(TEST_LEDGER);
  });

  afterEach(() => {
    (PATHS as any).ledgerPath = ORIGINAL_LEDGER;
    if (existsSync(TEST_LEDGER)) rmSync(TEST_LEDGER);
  });

  it("rejects unauthorized request", () => {
    const result = recordVeto("bad-token", { target: "x", reason: "y", severity: "advisory" }, "test");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Unauthorized");
  });

  it("rejects missing target", () => {
    const result = recordVeto(getSecret(), { target: "", reason: "y", severity: "advisory" }, "test");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Missing target or reason");
  });

  it("rejects missing reason", () => {
    const result = recordVeto(getSecret(), { target: "x", reason: "", severity: "advisory" }, "test");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Missing target or reason");
  });

  it("records valid veto", () => {
    const result = recordVeto(
      getSecret(),
      { target: "build-42", reason: "quality concern", severity: "blocking" },
      "victor",
    );
    expect(result.ok).toBe(true);
    expect(result.seq).toBe(1);
    const entries = parseLedger(TEST_LEDGER);
    expect(entries.length).toBe(1);
    expect(entries[0].type).toBe("VETO");
    expect((entries[0].payload as any).severity).toBe("blocking");
  });

  it("defaults severity to advisory", () => {
    const result = recordVeto(
      getSecret(),
      { target: "x", reason: "y", severity: "advisory" },
      "test",
    );
    expect(result.ok).toBe(true);
    const entries = parseLedger(TEST_LEDGER);
    expect((entries[0].payload as any).severity).toBe("advisory");
  });
});
