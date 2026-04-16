import { describe, it, expect } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import {
  createDirectiveExecutionRunner,
  parseDirectivePlan,
} from "../src/heartbeat/directive-runner";

const TMP_DIR = "/tmp/victor-directive-runner";

describe("parseDirectivePlan", () => {
  it("extracts workdir, run, test, expected files, and acceptance directives", () => {
    const plan = parseDirectivePlan(
      [
        "WORKDIR: ./victor",
        "RUN: bun test",
        "TEST: test -f output.txt",
        "EXPECT-FILE: output.txt",
        "ACCEPT: AC1",
      ].join("\n"),
      { defaultWorkdir: "/repo" },
    );

    expect(plan.workdir).toBe("./victor");
    expect(plan.run).toEqual(["bun test"]);
    expect(plan.test).toEqual(["test -f output.txt"]);
    expect(plan.expectFiles).toEqual(["output.txt"]);
    expect(plan.acceptance).toEqual(["AC1"]);
  });
});

describe("createDirectiveExecutionRunner", () => {
  it("executes bounded directives and returns evidence", async () => {
    rmSync(TMP_DIR, { recursive: true, force: true });
    mkdirSync(TMP_DIR, { recursive: true });

    const runner = createDirectiveExecutionRunner({
      defaultWorkdir: TMP_DIR,
      allowedRoots: ["/tmp"],
    });

    const result = await runner.run({
      taskId: "t1",
      phaseId: "p1",
      source: "forge:queue:p1",
      title: "Generate file",
      description: [
        "WORKDIR: .",
        "RUN: printf 'export const generated = 1;\\n' > generated.ts",
        "TEST: test -f generated.ts",
        "EXPECT-FILE: generated.ts",
      ].join("\n"),
      acceptance: ["AC1"],
      urgency: "high",
    });

    expect(result.status).toBe("completed");
    expect(result.testsPassed).toBe(1);
    expect(result.filesChanged).toEqual(["generated.ts"]);
    expect(result.acceptanceMet).toEqual(["AC1"]);
    expect(readFileSync(`${TMP_DIR}/generated.ts`, "utf-8")).toContain("generated");
  });

  it("blocks when directives are missing", async () => {
    const runner = createDirectiveExecutionRunner({
      defaultWorkdir: TMP_DIR,
      allowedRoots: ["/tmp"],
    });

    const result = await runner.run({
      taskId: "t2",
      phaseId: "p1",
      source: "forge:queue:p1",
      title: "No directives",
      description: "plain text only",
      acceptance: [],
      urgency: "high",
    });

    expect(result.status).toBe("blocked");
    expect(result.reason).toBe("no_execution_directive");
  });

  it("fails when expected files do not change", async () => {
    rmSync(TMP_DIR, { recursive: true, force: true });
    mkdirSync(TMP_DIR, { recursive: true });
    writeFileSync(`${TMP_DIR}/stable.txt`, "stable");

    const runner = createDirectiveExecutionRunner({
      defaultWorkdir: TMP_DIR,
      allowedRoots: ["/tmp"],
    });

    const result = await runner.run({
      taskId: "t3",
      phaseId: "p1",
      source: "forge:queue:p1",
      title: "No delta",
      description: [
        "WORKDIR: .",
        "RUN: test -f stable.txt",
        "TEST: test -f stable.txt",
        "EXPECT-FILE: stable.txt",
      ].join("\n"),
      acceptance: [],
      urgency: "high",
    });

    expect(result.status).toBe("failed");
    expect(result.reason).toBe("no_expected_file_delta");
  });
});
