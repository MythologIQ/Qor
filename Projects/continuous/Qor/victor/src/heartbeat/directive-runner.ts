import { existsSync, statSync } from "fs";
import { relative, resolve } from "path";
import type { ExecutionIntent, ExecutionResult, ExecutionRunner } from "./execution-dispatch";

const DEFAULT_WORKDIR = "/home/workspace/Projects/continuous/Qor";
const DEFAULT_ALLOWED_ROOTS = ["/home/workspace", "/tmp"];

export interface ExecutionDirectivePlan {
  workdir: string;
  run: string[];
  test: string[];
  expectFiles: string[];
  acceptance: string[];
}

interface DirectiveRunnerOptions {
  defaultWorkdir?: string;
  allowedRoots?: string[];
}

export function parseDirectivePlan(
  description: string,
  options: DirectiveRunnerOptions = {},
): ExecutionDirectivePlan {
  const defaultWorkdir = options.defaultWorkdir ?? DEFAULT_WORKDIR;
  const plan: ExecutionDirectivePlan = {
    workdir: defaultWorkdir,
    run: [],
    test: [],
    expectFiles: [],
    acceptance: [],
  };

  for (const rawLine of description.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const [prefix, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    if (!value) continue;

    switch (prefix.trim().toUpperCase()) {
      case "WORKDIR":
        plan.workdir = value;
        break;
      case "RUN":
        plan.run.push(value);
        break;
      case "TEST":
        plan.test.push(value);
        break;
      case "EXPECT-FILE":
        plan.expectFiles.push(value);
        break;
      case "ACCEPT":
        plan.acceptance.push(value);
        break;
      default:
        break;
    }
  }

  return plan;
}

function resolveWorkdir(workdir: string, defaultWorkdir: string): string {
  return workdir.startsWith("/") ? resolve(workdir) : resolve(defaultWorkdir, workdir);
}

function isAllowedPath(path: string, allowedRoots: string[]): boolean {
  return allowedRoots.some((root) => path === root || path.startsWith(`${root}/`));
}

function snapshotExpectedFiles(workdir: string, expectedFiles: string[]): Map<string, number> {
  const snapshot = new Map<string, number>();
  for (const file of expectedFiles) {
    const absolute = resolve(workdir, file);
    snapshot.set(absolute, existsSync(absolute) ? statSync(absolute).mtimeMs : -1);
  }
  return snapshot;
}

function collectChangedFiles(
  workdir: string,
  defaultWorkdir: string,
  before: Map<string, number>,
): string[] {
  const changed: string[] = [];
  for (const [absolute, priorMtime] of before.entries()) {
    if (!existsSync(absolute)) continue;
    const nextMtime = statSync(absolute).mtimeMs;
    if (priorMtime < 0 || nextMtime > priorMtime) {
      const base = absolute.startsWith(`${defaultWorkdir}/`) || absolute === defaultWorkdir
        ? defaultWorkdir
        : workdir;
      changed.push(relative(base, absolute) || absolute);
    }
  }
  return changed;
}

function runShellCommand(command: string, cwd: string): {
  success: boolean;
  stdout: string;
  stderr: string;
} {
  const result = Bun.spawnSync({
    cmd: ["bash", "-lc", command],
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  return {
    success: result.exitCode === 0,
    stdout: new TextDecoder().decode(result.stdout).trim(),
    stderr: new TextDecoder().decode(result.stderr).trim(),
  };
}

export function createDirectiveExecutionRunner(
  options: DirectiveRunnerOptions = {},
): ExecutionRunner {
  const defaultWorkdir = options.defaultWorkdir ?? DEFAULT_WORKDIR;
  const allowedRoots = options.allowedRoots ?? DEFAULT_ALLOWED_ROOTS;

  return {
    async run(intent: ExecutionIntent): Promise<ExecutionResult> {
      const plan = parseDirectivePlan(intent.description, { defaultWorkdir });
      const cwd = resolveWorkdir(plan.workdir, defaultWorkdir);

      if (!isAllowedPath(cwd, allowedRoots)) {
        return {
          status: "blocked",
          summary: `Execution blocked: workdir ${cwd} is outside allowed roots.`,
          reason: "workdir_out_of_bounds",
        };
      }

      if (plan.run.length === 0) {
        return {
          status: "blocked",
          summary: `Execution blocked: no RUN directive declared for ${intent.taskId}.`,
          reason: "no_execution_directive",
        };
      }

      if (plan.test.length === 0) {
        return {
          status: "blocked",
          summary: `Execution blocked: no TEST directive declared for ${intent.taskId}.`,
          reason: "test_directive_missing",
        };
      }

      if (plan.expectFiles.length === 0) {
        return {
          status: "blocked",
          summary: `Execution blocked: no EXPECT-FILE directive declared for ${intent.taskId}.`,
          reason: "expected_file_directive_missing",
        };
      }

      const before = snapshotExpectedFiles(cwd, plan.expectFiles);

      for (const command of plan.run) {
        const result = runShellCommand(command, cwd);
        if (!result.success) {
          return {
            status: "failed",
            summary: `Execution failed while running command for ${intent.taskId}.`,
            reason: result.stderr || result.stdout || "run_command_failed",
          };
        }
      }

      for (const command of plan.test) {
        const result = runShellCommand(command, cwd);
        if (!result.success) {
          return {
            status: "failed",
            summary: `Execution failed tests for ${intent.taskId}.`,
            reason: result.stderr || result.stdout || "test_command_failed",
          };
        }
      }

      const changedFiles = collectChangedFiles(cwd, defaultWorkdir, before);
      if (changedFiles.length === 0) {
        return {
          status: "failed",
          summary: `Execution failed: expected files did not change for ${intent.taskId}.`,
          reason: "no_expected_file_delta",
        };
      }

      const acceptanceMet = intent.acceptance.length > 0
        ? intent.acceptance
        : (plan.acceptance.length > 0 ? plan.acceptance : changedFiles);

      return {
        status: "completed",
        summary: `Executed ${plan.run.length} run command(s) and ${plan.test.length} test command(s) for ${intent.taskId}.`,
        testsPassed: plan.test.length,
        filesChanged: changedFiles,
        acceptanceMet,
      };
    },
  };
}
